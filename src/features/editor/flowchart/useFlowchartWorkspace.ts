import { findGameConfigEntryValue } from '~/commands/game'
import {
  createDefaultFlowchartDocument,
  normalizeFlowchartDocument,
  parseFlowchartDocument,
  serializeFlowchartDocument,
} from '~/domain/flowchart/codec'
import {
  createFlowchartHistory,
  recordFlowchartChange,
  redoFlowchartChange,
  undoFlowchartChange,
} from '~/domain/flowchart/history'
import {
  deriveSceneNodeTitle,
  findFlowchart,
  FlowchartRuleError,
  MAIN_FLOWCHART_ID,
} from '~/domain/flowchart/model'
import {
  addEdge,
  addNode,
  bindNodeScene,
  createFlowchart,
  deleteEdges,
  deleteFlowchart as deleteFlowchartOperation,
  deleteNodes,
  moveNode as moveNodeOperation,
  renameFlowchart as renameFlowchartOperation,
  renameNode as renameNodeOperation,
} from '~/domain/flowchart/operations'
import { createFlowchartAutoSaveController } from '~/features/editor/flowchart/flowchart-autosave'
import { readFlowchartFile, writeFlowchartFile } from '~/features/editor/flowchart/flowchart-file'
import { configManager } from '~/services/config-manager'
import { handleError } from '~/utils/error-handler'

import type { GameConfigEntry } from '~/commands/game'
import type { FlowchartDocumentDefaults } from '~/domain/flowchart/codec'
import type { FlowchartHistory } from '~/domain/flowchart/history'
import type {
  Flowchart,
  FlowchartDocument,
  FlowchartNodePosition,
  FlowchartRuleViolation,
  FlowchartSceneRef,
} from '~/domain/flowchart/model'
import type { AbsPath } from '~/domain/path'

/** 游戏配置中的流程图开关项；取值按 WebGAL 的字符串约定处理 */
const FLOWCHART_ENABLED_CONFIG_KEY = 'Enable_flowchart'

const AUTO_SAVE_DEBOUNCE_MS = 400

export type FlowchartWorkspaceStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseFlowchartWorkspaceOptions {
  gamePath: MaybeRefOrGetter<AbsPath | undefined>
}

export interface FlowchartWorkspace {
  activeFlowchart: Readonly<Ref<Flowchart | undefined>>
  activeFlowchartId: Readonly<Ref<string>>
  addNode: (position: FlowchartNodePosition) => string | undefined
  addNodeFromScene: (position: FlowchartNodePosition, scene: FlowchartSceneRef) => string | undefined
  bindScene: (nodeId: string, scene: FlowchartSceneRef) => void
  canRedo: Readonly<Ref<boolean>>
  canUndo: Readonly<Ref<boolean>>
  connect: (source: string, target: string) => boolean
  createBranch: (position: FlowchartNodePosition) => string | undefined
  deleteFlowchart: (flowchartId: string) => void
  deleteSelection: (nodeIds: readonly string[], edgeIds: readonly string[]) => void
  dirty: Readonly<Ref<boolean>>
  enableFlowchart: () => Promise<void>
  errorMessage: Readonly<Ref<string | undefined>>
  flowchartEnabled: Readonly<Ref<boolean>>
  flowcharts: Readonly<Ref<Flowchart[]>>
  flush: () => Promise<void>
  isEnablingFlowchart: Readonly<Ref<boolean>>
  moveNode: (nodeId: string, position: FlowchartNodePosition) => void
  redo: () => void
  reload: () => Promise<void>
  renameFlowchart: (flowchartId: string, name: string) => void
  renameNode: (nodeId: string, title: string) => void
  selectFlowchart: (flowchartId: string) => void
  status: Readonly<Ref<FlowchartWorkspaceStatus>>
  undo: () => void
}

/**
 * 流程图编辑会话。
 *
 * 所有编辑都经由这里的命令边界进入状态：领域操作负责校验，会话负责历史、脏标记与自动保存，
 * UI 只调用命令并渲染结果，不直接修改持久化模型。
 */
export function useFlowchartWorkspace(options: UseFlowchartWorkspaceOptions): FlowchartWorkspace {
  const { t } = useI18n()

  const document = shallowRef<FlowchartDocument>()
  const history = shallowRef<FlowchartHistory>(createFlowchartHistory())
  const savedContent = shallowRef('')
  const activeFlowchartId = ref(MAIN_FLOWCHART_ID)
  const status = ref<FlowchartWorkspaceStatus>('loading')
  const errorMessage = ref<string>()
  const flowchartEnabled = ref(false)
  const isEnablingFlowchart = ref(false)

  // 规则冲突到界面文案的唯一映射；逐条使用字面量 key，便于 i18n 校验追踪引用
  const ruleViolationMessages: Record<FlowchartRuleViolation, () => string> = {
    'cycle': () => t('edit.flowchart.errors.cycle'),
    'duplicate-edge': () => t('edit.flowchart.errors.duplicateEdge'),
    'flowchart-not-found': () => t('edit.flowchart.errors.flowchartNotFound'),
    'invalid-name': () => t('edit.flowchart.errors.invalidName'),
    'main-flowchart-protected': () => t('edit.flowchart.errors.mainProtected'),
    'node-not-found': () => t('edit.flowchart.errors.nodeNotFound'),
    'root-node-protected': () => t('edit.flowchart.errors.rootProtected'),
    'self-loop': () => t('edit.flowchart.errors.selfLoop'),
  }

  let sessionPath: AbsPath | undefined
  let loadGeneration = 0

  const flowcharts = computed(() => document.value?.flowcharts ?? [])
  const activeFlowchart = computed(() => {
    const current = document.value
    return current ? findFlowchart(current, activeFlowchartId.value) : undefined
  })
  const dirty = computed(() => {
    const current = document.value
    return current !== undefined && serializeFlowchartDocument(current) !== savedContent.value
  })
  const canUndo = computed(() => history.value.undoStack.length > 0)
  const canRedo = computed(() => history.value.redoStack.length > 0)

  function resolveDefaults(): FlowchartDocumentDefaults {
    return {
      mainFlowchartName: t('edit.flowchart.defaults.mainFlowchartName'),
      nodeTitle: t('edit.flowchart.defaults.nodeTitle'),
      rootNodeTitle: t('edit.flowchart.defaults.rootNodeTitle'),
    }
  }

  async function saveNow(): Promise<void> {
    // 只有已加载文档的变更才会入队，重置会话前会等待保存完成。
    const content = serializeFlowchartDocument(document.value!)
    await writeFlowchartFile(sessionPath!, content)
    savedContent.value = content
  }

  const autoSave = createFlowchartAutoSaveController({
    debounceMs: AUTO_SAVE_DEBOUNCE_MS,
    onError(error) {
      handleError(error, { context: t('edit.flowchart.saveFailed') })
    },
    save: saveNow,
  })

  function resetSession() {
    document.value = undefined
    history.value = createFlowchartHistory()
    savedContent.value = ''
    activeFlowchartId.value = MAIN_FLOWCHART_ID
    flowchartEnabled.value = false
    errorMessage.value = undefined
    status.value = 'idle'
  }

  function applyLoadedContent(raw: string | undefined) {
    const defaults = resolveDefaults()
    const loaded = raw === undefined
      ? createDefaultFlowchartDocument(defaults)
      : loadExistingDocument(raw, defaults)

    // 基线取补全后的内容：仅浏览不会改写文件，首次真实编辑时才落盘补全结果
    document.value = loaded
    savedContent.value = serializeFlowchartDocument(loaded)
    history.value = createFlowchartHistory()
    activeFlowchartId.value = MAIN_FLOWCHART_ID
  }

  function loadExistingDocument(raw: string, defaults: FlowchartDocumentDefaults): FlowchartDocument {
    const parsed = parseFlowchartDocument(raw)
    for (const warning of parsed.warnings) {
      logger.warn(`[flowchart] ${warning}`)
    }
    return normalizeFlowchartDocument(parsed.document, defaults)
  }

  async function loadSession(gamePath: AbsPath, entries?: readonly GameConfigEntry[]): Promise<void> {
    const generation = ++loadGeneration
    sessionPath = gamePath
    status.value = 'loading'
    errorMessage.value = undefined

    try {
      const config = entries ? { entries } : await configManager.getConfig(gamePath)
      if (generation !== loadGeneration) {
        return
      }

      flowchartEnabled.value = findGameConfigEntryValue(config.entries, FLOWCHART_ENABLED_CONFIG_KEY) === 'true'
      if (!flowchartEnabled.value) {
        status.value = 'idle'
        return
      }

      const raw = await readFlowchartFile(gamePath)
      if (generation !== loadGeneration) {
        return
      }

      applyLoadedContent(raw)
      status.value = 'ready'
    } catch (error) {
      if (generation !== loadGeneration) {
        return
      }
      status.value = 'error'
      errorMessage.value = error instanceof Error ? error.message : String(error)
      logger.error(`[flowchart] 加载流程图失败: ${errorMessage.value}`)
    }
  }

  function reportRuleViolation(error: unknown): false {
    if (!(error instanceof FlowchartRuleError)) {
      throw error
    }

    toast.error(ruleViolationMessages[error.violation]())
    return false
  }

  function commit(next: FlowchartDocument): void {
    const current = document.value!
    if (next === current) {
      return
    }

    history.value = recordFlowchartChange(history.value, current)
    document.value = next
    autoSave.schedule()
  }

  function run(command: (current: FlowchartDocument) => FlowchartDocument): boolean {
    const current = document.value
    if (!current) {
      return false
    }

    try {
      commit(command(current))
      return true
    } catch (error) {
      return reportRuleViolation(error)
    }
  }

  function ensureActiveFlowchartAvailable(next: FlowchartDocument): void {
    if (!findFlowchart(next, activeFlowchartId.value)) {
      activeFlowchartId.value = MAIN_FLOWCHART_ID
    }
  }

  function selectFlowchart(flowchartId: string): void {
    const current = document.value
    if (!current || !findFlowchart(current, flowchartId)) {
      return
    }
    activeFlowchartId.value = flowchartId
  }

  function addNodeAt(
    position: FlowchartNodePosition,
    scene: FlowchartSceneRef | undefined,
  ): string | undefined {
    const current = document.value
    if (!current) {
      return
    }

    const title = scene ? deriveSceneNodeTitle(scene) : t('edit.flowchart.defaults.nodeTitle')
    try {
      const result = addNode(current, activeFlowchartId.value, { title, position, scene })
      commit(result.document)
      return result.id
    } catch (error) {
      reportRuleViolation(error)
    }
  }

  function deleteSelection(nodeIds: readonly string[], edgeIds: readonly string[]): void {
    if (nodeIds.length === 0 && edgeIds.length === 0) {
      return
    }

    const flowchartId = activeFlowchartId.value
    run(source => deleteNodes(deleteEdges(source, flowchartId, edgeIds), flowchartId, nodeIds))
  }

  function connect(source: string, target: string): boolean {
    return run(current => addEdge(current, activeFlowchartId.value, source, target).document)
  }

  function createBranch(position: FlowchartNodePosition): string | undefined {
    const current = document.value
    if (!current) {
      return
    }

    const branchCount = current.flowcharts.filter(flowchart => flowchart.kind === 'character').length
    try {
      const result = createFlowchart(current, {
        name: t('edit.flowchart.defaults.branchName', { index: branchCount + 1 }),
        position,
        rootTitle: t('edit.flowchart.defaults.rootNodeTitle'),
      })
      commit(result.document)
      activeFlowchartId.value = result.id
      return result.id
    } catch (error) {
      reportRuleViolation(error)
    }
  }

  function applyHistoryStep(step: ReturnType<typeof undoFlowchartChange>): void {
    if (!step) {
      return
    }

    document.value = step.document
    history.value = step.history
    ensureActiveFlowchartAvailable(step.document)
    autoSave.schedule()
  }

  function undo(): void {
    const current = document.value
    if (current) {
      applyHistoryStep(undoFlowchartChange(history.value, current))
    }
  }

  function redo(): void {
    const current = document.value
    if (current) {
      applyHistoryStep(redoFlowchartChange(history.value, current))
    }
  }

  async function enableFlowchart(): Promise<void> {
    const gamePath = sessionPath
    if (!gamePath || isEnablingFlowchart.value) {
      return
    }

    isEnablingFlowchart.value = true
    try {
      await configManager.updateConfigEntry(gamePath, FLOWCHART_ENABLED_CONFIG_KEY, 'true')
    } catch (error) {
      handleError(error, { context: t('edit.flowchart.enableFailed') })
    } finally {
      isEnablingFlowchart.value = false
    }
  }

  async function reload(): Promise<void> {
    if (sessionPath) {
      await loadSession(sessionPath)
    }
  }

  const flush = autoSave.flush

  configManager.onConfigChanged(async ({ gamePath, config }) => {
    if (gamePath !== sessionPath) {
      return
    }

    const enabled = findGameConfigEntryValue(config.entries, FLOWCHART_ENABLED_CONFIG_KEY) === 'true'
    if (enabled === flowchartEnabled.value && status.value !== 'loading') {
      return
    }

    if (enabled && !document.value) {
      await loadSession(gamePath, config.entries)
      return
    }

    // 关闭只隐藏画布；保留会话与保存队列，避免重新启用时丢失编辑和历史。
    loadGeneration += 1
    flowchartEnabled.value = enabled
    errorMessage.value = undefined
    status.value = enabled ? 'ready' : 'idle'
  })

  watch(
    () => toValue(options.gamePath),
    async (gamePath, _previousPath, onCleanup) => {
      let isStale = false
      onCleanup(() => {
        isStale = true
      })
      loadGeneration += 1
      await flush()
      if (isStale) {
        return
      }
      resetSession()
      sessionPath = undefined

      if (gamePath) {
        await loadSession(gamePath)
      }
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    loadGeneration += 1
    void flush().catch(error => handleError(error, { context: t('edit.flowchart.saveFailed') }))
  })

  return {
    activeFlowchart,
    activeFlowchartId,
    addNode: position => addNodeAt(position, undefined),
    addNodeFromScene: (position, scene) => addNodeAt(position, scene),
    bindScene: (nodeId, scene) => {
      run(current => bindNodeScene(current, activeFlowchartId.value, nodeId, scene))
    },
    canRedo,
    canUndo,
    connect,
    createBranch,
    deleteFlowchart: (flowchartId) => {
      if (run(current => deleteFlowchartOperation(current, flowchartId))) {
        ensureActiveFlowchartAvailable(document.value!)
      }
    },
    deleteSelection,
    dirty,
    enableFlowchart,
    errorMessage,
    flowchartEnabled,
    flowcharts,
    flush,
    isEnablingFlowchart,
    moveNode: (nodeId, position) => {
      run(current => moveNodeOperation(current, activeFlowchartId.value, nodeId, position))
    },
    redo,
    reload,
    renameFlowchart: (flowchartId, name) => {
      run(current => renameFlowchartOperation(current, flowchartId, name))
    },
    renameNode: (nodeId, title) => {
      run(current => renameNodeOperation(current, activeFlowchartId.value, nodeId, title))
    },
    selectFlowchart,
    status,
    undo,
  }
}
