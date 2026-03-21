import { readTextFile, stat } from '@tauri-apps/plugin-fs'
import { defineStore } from 'pinia'

import { mime } from '~/plugins/mime'

interface CoreEditorState {
  path: string
}

type VisualType = 'scene' | 'animation'

interface TextualEditorBase extends CoreEditorState {
  isDirty: boolean
  lastSavedTime?: Date
  visualType?: VisualType
  lastLineNumber?: number
}

export interface TextModeState extends TextualEditorBase {
  mode: 'text'
  textContent: string
}

export interface VisualModeSceneState extends TextualEditorBase {
  mode: 'visual'
  visualType: 'scene'
  statements: StatementEntry[]
  savedSnapshot: string
  lastEditedStatementId?: number
}

export interface VisualModeAnimationState extends TextualEditorBase {
  mode: 'visual'
  visualType: 'animation'
  rawContent: string
  savedSnapshot: string
}

export type VisualModeState = VisualModeSceneState | VisualModeAnimationState

export type TextualEditorState = TextModeState | VisualModeState

export interface AssetPreviewState extends CoreEditorState {
  mode: 'preview'
  assetUrl: string
  mimeType: string
  fileSize?: number
}

export interface UnsupportedState extends CoreEditorState {
  mode: 'unsupported'
  reason: string
}

type EditorState = TextualEditorState | AssetPreviewState | UnsupportedState

export function isTextualEditor(state: EditorState): state is TextualEditorState {
  return state.mode === 'text' || state.mode === 'visual'
}

export function isVisualScene(state: EditorState): state is VisualModeSceneState {
  return state.mode === 'visual' && state.visualType === 'scene'
}

export function isVisualAnimation(state: EditorState): state is VisualModeAnimationState {
  return state.mode === 'visual' && state.visualType === 'animation'
}

/**
 * 从可视模式状态提取全文本内容
 */
function getVisualContent(state: VisualModeState): string {
  if (state.visualType === 'scene') {
    return joinStatements(state.statements)
  }
  return state.rawContent
}

/**
 * 根据语句 ID 计算其在全文中的起始行号（1-based）
 */
export function computeLineNumberFromStatementId(
  statements: StatementEntry[],
  statementId: number,
): number | undefined {
  let currentLine = 1
  for (const entry of statements) {
    if (entry.id === statementId) {
      return currentLine
    }
    // 用字符计数替代 split('\n').length，避免为每个 entry 创建临时数组
    const text = entry.rawText
    let newlines = 1
    let pos = 0
    while ((pos = text.indexOf('\n', pos)) !== -1) {
      newlines++
      pos++
    }
    currentLine += newlines
  }
  return undefined
}

/**
 * 构建可视模式状态
 */
function createVisualState(
  base: Omit<TextualEditorBase, 'visualType'>,
  visualType: VisualType,
  content: string,
): VisualModeState {
  if (visualType === 'scene') {
    return {
      ...base,
      mode: 'visual',
      visualType: 'scene',
      statements: buildStatements(content),
      savedSnapshot: content,
    }
  }
  return {
    ...base,
    mode: 'visual',
    visualType: 'animation',
    rawContent: content,
    savedSnapshot: content,
  }
}

async function checkFileType(path: string, subPath: string, mimeType: string, expectedMimeType: string): Promise<boolean> {
  if (mimeType !== expectedMimeType) {
    return false
  }
  const workspaceStore = useWorkspaceStore()

  // 等待 CWD 加载完成，最多等待 100 ms
  try {
    await until(() => !!workspaceStore.CWD).toBe(true, { timeout: 100, throwOnTimeout: true })
  } catch {
    logger.error('Workspace 未初始化，无法检查文件类型')
  }

  if (!workspaceStore.CWD) {
    return false
  }

  const targetPath = await gameAssetDir(workspaceStore.CWD, subPath)
  // 使用分隔符边界匹配，避免目录名存在前缀关系时误判
  return path.startsWith(`${targetPath}\\`) || path.startsWith(`${targetPath}/`)
}

function isSceneFile(path: string, mimeType: string): Promise<boolean> {
  return checkFileType(path, 'scene', mimeType, 'text/plain')
}

function isAnimationFile(path: string, mimeType: string): Promise<boolean> {
  return checkFileType(path, 'animation', mimeType, 'application/json')
}

const PREVIEW_MIME_PREFIXES = ['image/', 'video/', 'audio/']
const PREVIEW_SYNC_DEDUPE_WINDOW_MS = 160

interface PreviewSyncRecord {
  key: string
  timestamp: number
}

interface SceneCursorSnapshot {
  lineNumber: number
  lineText: string
}

function buildPreviewSyncKey(
  path: string,
  lineNumber: number,
  lineText: string,
  force: boolean,
): string {
  return `${path}|${lineNumber}|${lineText}|${force ? 1 : 0}`
}

function resolveSceneCursor(content: string, preferredLineNumber?: number): SceneCursorSnapshot {
  const lines = content.split('\n')
  const lineCount = Math.max(lines.length, 1)
  const lineNumber = Math.min(Math.max(preferredLineNumber ?? 1, 1), lineCount)
  return {
    lineNumber,
    lineText: lines[lineNumber - 1] ?? '',
  }
}

export const useEditorStore = defineStore('editor', () => {
  const states = $ref(new Map<string, EditorState>())
  let lastPreviewSyncRecord = $ref<PreviewSyncRecord>()

  const { t } = useI18n()
  const tabsStore = useTabsStore()
  const fileSystemEvents = useFileSystemEvents()

  const currentState = $computed(() => states.get(tabsStore.activeTab?.path ?? ''))

  const canToggleMode = $computed(() =>
    currentState !== undefined && isTextualEditor(currentState) && !!currentState.visualType,
  )

  function setTabLoading(path: string, isLoading: boolean) {
    const index = tabsStore.findTabIndex(path)
    if (index !== -1) {
      tabsStore.updateTabLoading(index, isLoading)
    }
  }

  function setTabError(path: string, error?: string) {
    const index = tabsStore.findTabIndex(path)
    if (index !== -1) {
      tabsStore.updateTabError(index, error)
    }
  }

  function setTabModified(path: string, isModified: boolean) {
    const index = tabsStore.findTabIndex(path)
    if (index !== -1) {
      tabsStore.updateTabModified(index, isModified)
    }
  }

  function syncScenePreview(path: string, lineNumber: number, lineText: string, force: boolean = false) {
    const normalizedLineNumber = Math.max(1, Math.trunc(lineNumber))
    const normalizedLineText = lineText ?? ''
    const now = Date.now()
    const key = buildPreviewSyncKey(path, normalizedLineNumber, normalizedLineText, force)

    if (lastPreviewSyncRecord
      && lastPreviewSyncRecord.key === key
      && now - lastPreviewSyncRecord.timestamp < PREVIEW_SYNC_DEDUPE_WINDOW_MS) {
      return
    }

    lastPreviewSyncRecord = { key, timestamp: now }
    void debugCommander.syncScene(path, normalizedLineNumber, normalizedLineText, force)
  }

  async function loadEditorState(tab: Tab) {
    if (states.has(tab.path)) {
      return
    }

    const path = tab.path

    try {
      setTabError(path, undefined)
      setTabLoading(path, true)

      // 有 mime 类型且符合预览条件的文件，直接进入文件预览模式
      const mimeType = mime.getType(path) ?? ''
      if (PREVIEW_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix))) {
        const workspaceStore = useWorkspaceStore()
        await until(() => !!workspaceStore.currentGameServeUrl).toBe(true)

        let fileSize: number | undefined
        try {
          const fileStat = await stat(path)
          fileSize = fileStat.size
        } catch {
          // 获取文件大小失败时忽略，不影响预览
        }

        states.set(path, {
          path,
          mode: 'preview',
          assetUrl: getAssetUrl(path),
          mimeType,
          fileSize,
        })
      } else {
        // 检测文件是否为二进制
        let isBinary: boolean
        try {
          isBinary = await fsCmds.isBinaryFile(path)
        } catch (error) {
          // 检测失败，展示错误提示
          const msg = error instanceof Error ? error.message : String(error)
          states.set(path, {
            path,
            mode: 'unsupported',
            reason: t('edit.unsupported.loadFailed', { error: msg }),
          })
          return
        }

        if (isBinary) {
          states.set(path, {
            path,
            mode: 'unsupported',
            reason: t('edit.unsupported.binaryFile'),
          })
        } else {
          // 文本文件：沿用现有文本/可视编辑逻辑
          const preferenceStore = usePreferenceStore()
          const content = await readTextFile(path)

          let visualType: VisualType | undefined

          if (await isSceneFile(path, mimeType)) {
            visualType = 'scene'
          } else if (await isAnimationFile(path, mimeType)) {
            visualType = 'animation'
          }

          if (preferenceStore.editorMode === 'visual' && visualType) {
            states.set(path, createVisualState(
              { path, isDirty: false, lastLineNumber: undefined },
              visualType,
              content,
            ))
          } else {
            states.set(path, {
              path,
              isDirty: false,
              mode: 'text',
              textContent: content,
              visualType,
            })
          }
        }
      }
    } catch (error) {
      logger.error(`无法加载编辑器状态 ${path}: ${error}`)
      setTabError(path, error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setTabLoading(path, false)
      // 从磁盘加载的内容是干净的，重置持久化残留的修改标记
      setTabModified(path, false)
    }
  }

  function toggleTextualMode(mode: 'text' | 'visual', targetPath?: string) {
    const path = targetPath ?? tabsStore.activeTab?.path
    if (!path) {
      return
    }

    const state = states.get(path)
    if (!state || !isTextualEditor(state) || !state.visualType) {
      return
    }

    if (state.mode === mode) {
      return
    }

    const { isDirty, visualType, lastLineNumber } = state

    if (mode === 'text') {
      // visual → text：从可视状态提取全文本，并将 lastEditedStatementId 转换为行号
      const content = getVisualContent(state as VisualModeState)
      let syncedLineNumber = lastLineNumber
      if (isVisualScene(state) && state.lastEditedStatementId !== undefined) {
        syncedLineNumber = computeLineNumberFromStatementId(
          state.statements,
          state.lastEditedStatementId,
        ) ?? lastLineNumber
      }
      states.set(path, {
        path,
        isDirty,
        lastLineNumber: syncedLineNumber,
        mode: 'text',
        textContent: content,
        visualType,
      })
    } else {
      // text → visual：从文本构建可视状态，lastLineNumber 保持不变供可视编辑器定位
      const content = (state as TextModeState).textContent
      const base = { path, isDirty, lastLineNumber }
      states.set(path, createVisualState(base, visualType, content))
    }
  }

  watch(() => tabsStore.activeTab, async (activeTab) => {
    if (!activeTab) {
      return
    }

    if (!states.has(activeTab.path)) {
      await loadEditorState(activeTab)
      return
    }

    // 已加载的文件：同步编辑模式与全局偏好
    const preferenceStore = usePreferenceStore()
    toggleTextualMode(preferenceStore.editorMode, activeTab.path)
  }, { immediate: true })

  // 监听标签页关闭，清理编辑器状态
  useTabsWatcher((closedPath) => {
    states.delete(closedPath)
  })

  // 监听文件重命名事件，更新编辑器状态
  fileSystemEvents.on('file:renamed', (event) => {
    const oldState = states.get(event.oldPath)
    if (oldState) {
      oldState.path = event.newPath
      states.delete(event.oldPath)
      states.set(event.newPath, oldState)
    }
  })

  // 监听文件修改事件，如果文件未编辑，同步新文件内容
  fileSystemEvents.on('file:modified', async (event) => {
    const state = states.get(event.path)
    if (!state || !isTextualEditor(state)) {
      return
    }

    // 如果文件已编辑，则不处理（避免覆盖用户的编辑）
    if (state.isDirty) {
      return
    }

    try {
      const content = await readTextFile(event.path)

      // await 后重新获取最新 state，防止异步期间被 toggleTextualMode 等替换导致陈旧引用
      const freshState = states.get(event.path)
      if (!freshState || !isTextualEditor(freshState)) {
        return
      }

      // readTextFile 是异步的，期间 isDirty 可能已变化，再次检查
      if (freshState.isDirty) {
        return
      }

      // 内容相同则跳过（通常是编辑器自身写入触发的 watcher 事件）
      const currentContent = freshState.mode === 'text' ? freshState.textContent : getVisualContent(freshState)
      if (content === currentContent) {
        return
      }

      const isActiveSceneFile = tabsStore.activeTab?.path === event.path
      if (freshState.mode === 'text') {
        states.set(event.path, {
          ...freshState,
          textContent: content,
        })
        if (isActiveSceneFile && freshState.visualType === 'scene') {
          const { lineNumber, lineText } = resolveSceneCursor(content, freshState.lastLineNumber)
          syncScenePreview(event.path, lineNumber, lineText)
        }
      } else if (isVisualScene(freshState)) {
        const nextStatements = buildStatements(content)
        states.set(event.path, {
          ...freshState,
          statements: nextStatements,
          savedSnapshot: content,
        })
        if (isActiveSceneFile) {
          const firstEntry = nextStatements[0]
          const lineText = firstEntry?.rawText ?? ''
          syncScenePreview(event.path, 1, lineText)
        }
      } else if (isVisualAnimation(freshState)) {
        states.set(event.path, {
          ...freshState,
          rawContent: content,
          savedSnapshot: content,
        })
      }
    } catch (error) {
      logger.error(`同步文件内容失败 ${event.path}: ${error}`)
    }
  })

  /**
   * 保存文件
   * @param path 文件路径
   * @throws 如果文件不存在或不可编辑
   */
  async function saveFile(path: string) {
    const state = states.get(path)

    if (!state) {
      throw new AppError('EDITOR_ERROR', `文件状态不存在: ${path}`)
    }

    if (!isTextualEditor(state)) {
      throw new AppError('EDITOR_ERROR', `文件不可编辑: ${path}`)
    }

    const content = state.mode === 'text'
      ? state.textContent
      : getVisualContent(state)

    await gameFs.writeFile(path, content)
    state.isDirty = false
    state.lastSavedTime = new Date()

    // 更新保存快照（可视模式下需要同步快照）
    if (state.mode === 'visual') {
      state.savedSnapshot = content
    }

    const tabIndex = tabsStore.findTabIndex(path)
    if (tabIndex !== -1) {
      tabsStore.updateTabModified(tabIndex, false)
    }

    // 保存后同步游戏预览（文本编辑器有自己的 syncScene，此处仅处理可视化编辑器）
    if (isVisualScene(state)) {
      const lineNumber = state.lastLineNumber ?? 1
      const entry = state.statements.find(e => e.id === (state.lastEditedStatementId ?? state.statements[0]?.id))
      const lineText = entry?.rawText ?? ''
      syncScenePreview(path, lineNumber, lineText)
    }
  }

  // 当前活跃文件是否为场景文件
  const isCurrentSceneFile = $computed(() =>
    currentState !== undefined && isTextualEditor(currentState) && currentState.visualType === 'scene',
  )

  return $$({
    states,
    currentState,
    canToggleMode,
    isCurrentSceneFile,
    toggleTextualMode,
    syncScenePreview,
    saveFile,
  })
})
