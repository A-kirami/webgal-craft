import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, toRaw } from 'vue'

import { encodeTextFile } from '~/models/file-codec'

import { useTabsStore } from '../tabs'

type WriteDocumentFile = typeof import('~/services/game-fs').gameFs.writeDocumentFile

const readFileMock = vi.fn(async () => new TextEncoder().encode('hello'))
const statMock = vi.fn(async () => ({ size: 5 }))
const writeDocumentFileMock = vi.fn<WriteDocumentFile>(async () => undefined)
const isBinaryFileMock = vi.fn(async () => false)
const syncSceneMock = vi.fn(async () => undefined)
const loggerWarnMock = vi.fn()
const loggerErrorMock = vi.fn()
const loggerDebugMock = vi.fn()
const loggerInfoMock = vi.fn()
const mimeGetTypeMock = vi.fn(() => 'text/plain')
const fileSystemEventHandlers = new Map<string, (event: unknown) => unknown>()
const modalOpenMock = vi.fn()
let externalDocumentModalAction: 'keep-local' | 'load-external' | 'merge' | 'cancel' = 'cancel'
const asyncFixtureTimeoutMs = 10 * 1000
let useEditorStore: typeof import('../editor').useEditorStore

const preferenceStoreMock = reactive({
  editorMode: 'text' as 'text' | 'visual',
})

const workspaceStoreMock = reactive({
  currentGame: { id: 'game-1', path: '/game' } as { id: string, path: string } | undefined,
  currentGameServeUrl: 'http://127.0.0.1:8899' as string | undefined,
  cwd: '/game' as string | undefined,
  get CWD() {
    return this.cwd
  },
})

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: readFileMock,
  stat: statMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: loggerWarnMock,
  error: loggerErrorMock,
  debug: loggerDebugMock,
  info: loggerInfoMock,
  attachConsole: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  basename: async (input: string) => input.split('/').at(-1) ?? input,
  join: async (...parts: string[]) => parts.join('/').replaceAll('//', '/'),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: () => preferenceStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: () => workspaceStoreMock,
}))

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: () => ({
    on: vi.fn((event: string, handler: (payload: unknown) => unknown) => {
      fileSystemEventHandlers.set(event, handler)
      return () => {
        fileSystemEventHandlers.delete(event)
      }
    }),
  }),
}))

vi.mock('~/composables/useTabsWatcher', () => ({
  useTabsWatcher: vi.fn((_onTabClosed: (path: string) => void) => undefined),
}))

vi.mock('~/services/game-fs', () => ({
  gameFs: {
    writeDocumentFile: writeDocumentFileMock,
  },
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: () => ({
    open: modalOpenMock,
  }),
}))

vi.mock('~/services/debug-commander', () => ({
  debugCommander: {
    syncScene: syncSceneMock,
  },
}))

vi.mock('~/helper/app-paths', () => ({
  gameAssetDir: async (cwd: string, assetType: string) => `${cwd}/${assetType}`,
}))

vi.mock('~/commands/fs', () => ({
  fsCmds: {
    isBinaryFile: isBinaryFileMock,
  },
}))

vi.mock('~/plugins/mime', () => ({
  mime: {
    getType: mimeGetTypeMock,
  },
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: vi.fn(),
}))

async function flushEditorWatchers() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

async function emitFileModifiedEvent(path: string) {
  const handler = fileSystemEventHandlers.get('file:modified')
  if (!handler) {
    throw new TypeError('missing file:modified handler')
  }

  await handler({ path })
}

async function emitFileRenamedEvent(oldPath: string, newPath: string) {
  const handler = fileSystemEventHandlers.get('file:renamed')
  if (!handler) {
    throw new TypeError('missing file:renamed handler')
  }

  await handler({ oldPath, newPath })
}

function assertWriteCall(call: unknown): asserts call is [string, Uint8Array] {
  if (
    !Array.isArray(call)
    || call.length !== 2
    || typeof call[0] !== 'string'
    || !(call[1] instanceof Uint8Array)
  ) {
    throw new TypeError(`unexpected write call: ${JSON.stringify(call)}`)
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function waitForEditorFixture(
  label: string,
  predicate: () => boolean,
  getDebugInfo?: () => Record<string, unknown>,
  remainingCycles: number = 12,
) {
  if (predicate()) {
    return
  }

  if (remainingCycles <= 0) {
    const debugInfo = getDebugInfo?.()
    const fixtureState: Record<string, unknown> = { label }
    if (debugInfo) {
      Object.assign(fixtureState, debugInfo)
    }
    throw new TypeError(`editor fixture did not settle: ${JSON.stringify(fixtureState)}`)
  }

  await flushEditorWatchers()
  await waitForEditorFixture(label, predicate, getDebugInfo, remainingCycles - 1)
}

async function openTabAndWaitFor(
  tabsStore: ReturnType<typeof useTabsStore>,
  name: string,
  path: string,
  predicate: () => boolean,
  label: string,
) {
  tabsStore.openTab(name, path, { forceNormal: true })

  await waitForEditorFixture(label, predicate, () => ({
    activeTab: tabsStore.activeTab?.path,
    isBinaryFileCalls: isBinaryFileMock.mock.calls.length,
    path,
    readFileCalls: readFileMock.mock.calls.length,
  }))
}

beforeAll(async () => {
  ({ useEditorStore } = await import('../editor'))
}, asyncFixtureTimeoutMs * 3)

describe('编辑器状态仓库的文本与文档流程', () => {
  beforeEach(() => {
    const tabsStore = useTabsStore()

    vi.useRealTimers()
    readFileMock.mockReset()
    statMock.mockReset()
    writeDocumentFileMock.mockReset()
    isBinaryFileMock.mockReset()
    syncSceneMock.mockReset()
    loggerWarnMock.mockClear()
    loggerErrorMock.mockClear()
    loggerDebugMock.mockClear()
    loggerInfoMock.mockClear()
    mimeGetTypeMock.mockReset()
    readFileMock.mockImplementation(async () => new TextEncoder().encode('hello'))
    statMock.mockImplementation(async () => ({ size: 5 }))
    writeDocumentFileMock.mockImplementation(async () => undefined)
    isBinaryFileMock.mockImplementation(async () => false)
    syncSceneMock.mockImplementation(async () => undefined)
    mimeGetTypeMock.mockReturnValue('text/plain')
    fileSystemEventHandlers.clear()
    modalOpenMock.mockReset()
    externalDocumentModalAction = 'cancel'
    modalOpenMock.mockImplementation((_name: string, payload: Record<string, () => void>) => {
      switch (externalDocumentModalAction) {
        case 'keep-local': {
          payload.onKeepLocal?.()
          return
        }
        case 'load-external': {
          payload.onLoadExternal?.()
          return
        }
        case 'merge': {
          payload.onMerge?.()
          return
        }
        default: {
          payload.onCancel?.()
        }
      }
    })

    tabsStore.projectTabsMap = {}
    tabsStore.runtimeTabStateMap = {}
    tabsStore.shouldFocusEditor = false
    preferenceStoreMock.editorMode = 'text'
    workspaceStoreMock.currentGame = { id: 'game-1', path: '/game' }
    workspaceStoreMock.currentGameServeUrl = 'http://127.0.0.1:8899'
    workspaceStoreMock.cwd = '/game'
  })

  it('加载纯文本文件后可应用补丁、保存并支持撤销重做', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/docs/example.txt'

    const editorStore = useEditorStore()

    await openTabAndWaitFor(tabsStore, 'example.txt', path, () => editorStore.hasState(path), 'load text document')

    const loadedState = editorStore.getState(path)
    if (!loadedState || !('projection' in loadedState) || loadedState.projection !== 'text') {
      throw new TypeError(`expected text editor state, got: ${JSON.stringify({
        loadedState,
        tab: tabsStore.activeTab,
        readFileCalls: readFileMock.mock.calls,
        isBinaryFileCalls: isBinaryFileMock.mock.calls,
      })}`)
    }

    expect(loadedState.textContent).toBe('hello')
    expect(loadedState.isDirty).toBe(false)

    editorStore.applyTextDocumentContent(path, 'hello!')

    expect(loadedState.textContent).toBe('hello!')
    expect(loadedState.isDirty).toBe(true)

    await editorStore.saveFile(path)

    expect(writeDocumentFileMock).toHaveBeenCalledTimes(1)
    const savedCall = writeDocumentFileMock.mock.calls.at(0)
    assertWriteCall(savedCall)
    const [savedPath, savedBytes] = savedCall
    expect(savedPath).toBe(path)
    expect(new TextDecoder().decode(savedBytes)).toBe('hello!')
    expect(loadedState.isDirty).toBe(false)

    editorStore.applyTextDocumentContent(path, 'hi', {
      source: 'visual',
    })

    expect(loadedState.textContent).toBe('hi')
    expect(loadedState.isDirty).toBe(true)

    expect(editorStore.undoDocument(path).applied).toBe(true)
    expect(loadedState.textContent).toBe('hello!')
    expect(loadedState.isDirty).toBe(false)

    expect(editorStore.redoDocument(path).applied).toBe(true)
    expect(loadedState.textContent).toBe('hi')
    expect(loadedState.isDirty).toBe(true)
  }, asyncFixtureTimeoutMs * 2)

  it('将模板 CSS 文件识别为模板文档且不创建可视化投影', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/template/example.css'

    const editorStore = useEditorStore()

    await openTabAndWaitFor(tabsStore, 'example.css', path, () => editorStore.hasState(path), 'load template document')

    const loadedState = editorStore.getState(path)
    if (!loadedState || !('projection' in loadedState) || loadedState.projection !== 'text') {
      throw new TypeError(`expected text projection state, got: ${JSON.stringify({ loadedState })}`)
    }

    expect(loadedState.kind).toBe('template')
    expect(editorStore.currentVisualProjection).toBeUndefined()
    expect(editorStore.canToggleMode).toBe(false)
  }, asyncFixtureTimeoutMs * 2)

  it('识别模板样式文件时忽略大小写', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/template/example.SCSS'

    const editorStore = useEditorStore()

    await openTabAndWaitFor(tabsStore, 'example.SCSS', path, () => editorStore.hasState(path), 'load template document with uppercase extension')

    const loadedState = editorStore.getState(path)
    if (!loadedState || !('projection' in loadedState) || loadedState.projection !== 'text') {
      throw new TypeError(`expected text projection state, got: ${JSON.stringify({ loadedState })}`)
    }

    expect(loadedState.kind).toBe('template')
    expect(editorStore.currentVisualProjection).toBeUndefined()
    expect(editorStore.canToggleMode).toBe(false)
  }, asyncFixtureTimeoutMs * 2)

  it('将模板目录中的非样式文件视为纯文本文档', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/template/example.txt'

    const editorStore = useEditorStore()

    await openTabAndWaitFor(tabsStore, 'example.txt', path, () => editorStore.hasState(path), 'load plaintext template directory document')

    const loadedState = editorStore.getState(path)
    if (!loadedState || !('projection' in loadedState) || loadedState.projection !== 'text') {
      throw new TypeError(`expected text projection state, got: ${JSON.stringify({ loadedState })}`)
    }

    expect(loadedState.kind).toBe('plaintext')
    expect(editorStore.currentVisualProjection).toBeUndefined()
    expect(editorStore.canToggleMode).toBe(false)
  }, asyncFixtureTimeoutMs * 2)

  it('为预览资源保存媒体会话并在重命名时迁移', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/video/preview.mp4'
    const renamedPath = '/game/video/preview-renamed.mp4'

    mimeGetTypeMock.mockReturnValue('video/mp4')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(tabsStore, 'preview.mp4', path, () => editorStore.hasState(path), 'load preview asset')

    const previewState = editorStore.getState(path)
    if (!previewState || 'projection' in previewState || previewState.view !== 'preview') {
      throw new TypeError('expected preview editor state')
    }

    editorStore.updatePreviewMediaSession(path, {
      currentTime: 12.5,
      paused: false,
      playbackRate: 1.25,
      volume: 0.4,
      muted: true,
    })

    expect(editorStore.getPreviewMediaSession(path)).toEqual({
      currentTime: 12.5,
      paused: false,
      playbackRate: 1.25,
      volume: 0.4,
      muted: true,
    })

    await emitFileRenamedEvent(path, renamedPath)

    const renamedPreviewState = editorStore.getState(renamedPath)
    if (!renamedPreviewState || 'projection' in renamedPreviewState || renamedPreviewState.view !== 'preview') {
      throw new TypeError('expected renamed preview editor state')
    }

    expect(renamedPreviewState.assetUrl).toContain('/video/preview-renamed.mp4')
    expect(editorStore.getPreviewMediaSession(path)).toBeUndefined()
    expect(editorStore.getPreviewMediaSession(renamedPath)).toEqual({
      currentTime: 12.5,
      paused: false,
      playbackRate: 1.25,
      volume: 0.4,
      muted: true,
    })
  })

  it('预览资源缺少预览 URL 时直接暴露错误而不是无限等待', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/video/preview-unavailable.mp4'

    workspaceStoreMock.currentGameServeUrl = undefined
    mimeGetTypeMock.mockReturnValue('video/mp4')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'preview-unavailable.mp4',
      path,
      () => tabsStore.activeTab?.path === path && tabsStore.activeTab?.isLoading === false,
      'load preview asset without preview url',
    )

    expect(editorStore.hasState(path)).toBe(false)
    expect(tabsStore.activeTab?.error).toBe('edit.errors.previewUnavailable')
  })

  it('工作区不可用时直接暴露错误而不是静默降级文档类型', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/scene/workspace-unavailable.txt'

    workspaceStoreMock.cwd = undefined

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'workspace-unavailable.txt',
      path,
      () => tabsStore.activeTab?.path === path && tabsStore.activeTab?.isLoading === false,
      'load document without workspace root',
    )

    expect(editorStore.hasState(path)).toBe(false)
    expect(tabsStore.activeTab?.error).toBe('edit.errors.workspaceUnavailable')
  })

  it('将连续文本输入合并为一次可重做快照', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/docs/merge.txt'

    const editorStore = useEditorStore()

    await openTabAndWaitFor(tabsStore, 'merge.txt', path, () => editorStore.hasState(path), 'load merge history document')

    const loadedState = editorStore.getState(path)
    if (!loadedState || !('projection' in loadedState) || loadedState.projection !== 'text') {
      throw new TypeError(`expected text editor state, got: ${JSON.stringify({ loadedState })}`)
    }

    for (let index = 0; index < 5; index++) {
      editorStore.applyTextDocumentContent(path, `${loadedState.textContent}x`)
    }

    expect(loadedState.textContent).toBe('helloxxxxx')

    expect(editorStore.undoDocument(path).applied).toBe(true)
    expect(loadedState.textContent).toBe('hello')

    expect(editorStore.redoDocument(path).applied).toBe(true)
    expect(loadedState.textContent).toBe('helloxxxxx')
  })

  it('在合并后的文本历史中使用文本补丁逆操作且不破坏撤销重做', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/docs/patch-inverse-merge.txt'

    const editorStore = useEditorStore()

    await openTabAndWaitFor(tabsStore, 'patch-inverse-merge.txt', path, () => editorStore.hasState(path), 'load patch inverse document')

    const loadedState = editorStore.getState(path)
    if (!loadedState || !('projection' in loadedState) || loadedState.projection !== 'text') {
      throw new TypeError(`expected text editor state, got: ${JSON.stringify({ loadedState })}`)
    }

    const firstNextContent = 'hello!'
    editorStore.applyTextDocumentContent(path, firstNextContent)

    const secondNextContent = 'hello!?'
    editorStore.applyTextDocumentContent(path, secondNextContent)

    expect(loadedState.textContent).toBe('hello!?')

    expect(editorStore.undoDocument(path).applied).toBe(true)
    expect(loadedState.textContent).toBe('hello')

    expect(editorStore.redoDocument(path).applied).toBe(true)
    expect(loadedState.textContent).toBe('hello!?')
  })

  it('在模式切换后保持文本与可视化投影稳定', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/scene/example.txt'

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'example.txt',
      path,
      () => editorStore.hasState(path)
        && editorStore.currentTextProjection !== undefined
        && editorStore.currentVisualProjection !== undefined,
      'load scene text and visual projections',
    )

    const textProjection = editorStore.currentTextProjection
    const visualProjection = editorStore.currentVisualProjection
    if (!textProjection || !visualProjection || visualProjection.projection !== 'visual' || visualProjection.kind !== 'scene') {
      throw new TypeError('expected both text and visual projections for scene file')
    }

    editorStore.setActiveProjection('visual', path)

    expect(toRaw(editorStore.currentState)).toBe(toRaw(visualProjection))
    expect(toRaw(editorStore.currentTextProjection)).toBe(toRaw(textProjection))
    expect(toRaw(editorStore.currentVisualProjection)).toBe(toRaw(visualProjection))

    editorStore.setActiveProjection('text', path)

    expect(toRaw(editorStore.currentState)).toBe(toRaw(textProjection))
    expect(toRaw(editorStore.currentTextProjection)).toBe(toRaw(textProjection))
    expect(toRaw(editorStore.currentVisualProjection)).toBe(toRaw(visualProjection))

    editorStore.syncSceneSelectionFromStatement(path, 1, {
      lastEditedStatementId: 1,
      lineNumber: 1,
    })

    expect(editorStore.currentSceneSelection?.selectedStatementId).toBe(1)
    expect(editorStore.currentSceneSelection?.lastLineNumber).toBe(1)
    expect(editorStore.currentSceneSelection?.lastEditedStatementId).toBe(1)
    expect(editorStore.currentTextProjection).not.toHaveProperty('lastLineNumber')
    expect(editorStore.currentVisualProjection).not.toHaveProperty('lastLineNumber')
    expect(editorStore.currentVisualProjection).not.toHaveProperty('lastEditedStatementId')
    expect(editorStore.currentVisualProjection).not.toHaveProperty('savedSnapshot')

    editorStore.applyTextDocumentContent(path, 'hello!')

    expect(textProjection.textContent).toBe('hello!')
    expect(visualProjection.statements[0]?.rawText).toBe('hello!')
    expect(editorStore.currentSelectedSceneStatement?.id).toBe(visualProjection.statements[0]?.id)
  })

  it('文本补丁重建语句后仍按语句 ID 保持场景侧栏选中项', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/scene/selection-sync.txt'

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('alpha\nbeta'))
    mimeGetTypeMock.mockReturnValue('text/plain')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'selection-sync.txt',
      path,
      () => editorStore.hasState(path) && editorStore.currentVisualProjection !== undefined,
      'load scene selection sync projection',
    )

    const visualProjection = editorStore.currentVisualProjection
    if (!visualProjection || visualProjection.projection !== 'visual' || visualProjection.kind !== 'scene') {
      throw new TypeError('expected visual scene projection')
    }

    editorStore.syncSceneSelectionFromTextLine(path, 2)

    expect(editorStore.currentSceneSelection?.lastLineNumber).toBe(2)
    expect(editorStore.currentSceneSelection?.selectedStatementId).toBe(visualProjection.statements[1]?.id)
    expect(editorStore.currentSelectedSceneStatement?.rawText).toBe('beta')

    const previousSelectedStatementId = editorStore.currentSceneSelection?.selectedStatementId

    editorStore.applyTextDocumentContent(path, 'alpha!\nbeta')

    expect(editorStore.currentSceneSelection?.lastLineNumber).toBe(2)
    expect(editorStore.currentSceneSelection?.selectedStatementId).toBe(previousSelectedStatementId)
    expect(editorStore.currentSelectedSceneStatement?.rawText).toBe('beta')

    editorStore.setActiveProjection('visual', path)
    expect(editorStore.currentSelectedSceneStatement?.rawText).toBe('beta')
  })

  it('切换到其他语句后仍可从历史中恢复可视化场景选中项', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/scene/visual-history-selection.txt'

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('alpha\nbeta'))
    mimeGetTypeMock.mockReturnValue('text/plain')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'visual-history-selection.txt',
      path,
      () => editorStore.hasState(path) && editorStore.currentVisualProjection !== undefined,
      'load visual history selection projection',
    )

    editorStore.setActiveProjection('visual', path)

    const visualProjection = editorStore.currentVisualProjection
    if (!visualProjection || visualProjection.projection !== 'visual' || visualProjection.kind !== 'scene') {
      throw new TypeError('expected visual scene projection')
    }

    const firstStatementId = visualProjection.statements[0]?.id
    const secondStatementId = visualProjection.statements[1]?.id
    if (firstStatementId === undefined || secondStatementId === undefined) {
      throw new TypeError('expected two scene statements')
    }

    editorStore.syncSceneSelectionFromStatement(path, firstStatementId, {
      lastEditedStatementId: firstStatementId,
      lineNumber: 1,
    })

    editorStore.applySceneStatementUpdate(path, firstStatementId, 'alpha!')
    expect(editorStore.currentSceneSelection?.selectedStatementId).toBe(firstStatementId)
    expect(editorStore.currentSelectedSceneStatement?.rawText).toBe('alpha!')

    editorStore.syncSceneSelectionFromStatement(path, secondStatementId, {
      lastEditedStatementId: secondStatementId,
      lineNumber: 2,
    })
    expect(editorStore.currentSceneSelection?.selectedStatementId).toBe(secondStatementId)
    expect(editorStore.currentSelectedSceneStatement?.rawText).toBe('beta')

    expect(editorStore.undoDocument(path).applied).toBe(true)
    expect(editorStore.currentSceneSelection?.selectedStatementId).toBe(firstStatementId)
    expect(editorStore.currentSceneSelection?.lastEditedStatementId).toBe(firstStatementId)
    expect(editorStore.currentSceneSelection?.lastLineNumber).toBe(1)
    expect(editorStore.currentSelectedSceneStatement?.rawText).toBe('alpha')

    expect(editorStore.redoDocument(path).applied).toBe(true)
    expect(editorStore.currentSceneSelection?.selectedStatementId).toBe(firstStatementId)
    expect(editorStore.currentSceneSelection?.lastEditedStatementId).toBe(firstStatementId)
    expect(editorStore.currentSceneSelection?.lastLineNumber).toBe(1)
    expect(editorStore.currentSelectedSceneStatement?.rawText).toBe('alpha!')
  })

  it('将场景折叠卡片状态保存在文档模型外并按语句 ID 对齐', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/scene/collapsed-state.txt'
    const renamedPath = '/game/scene/collapsed-state-renamed.txt'

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('alpha\nbeta'))

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'collapsed-state.txt',
      path,
      () => editorStore.hasState(path) && editorStore.currentVisualProjection !== undefined,
      'load scene collapsed-state projection',
    )

    const visualProjection = editorStore.currentVisualProjection
    if (!visualProjection || visualProjection.projection !== 'visual' || visualProjection.kind !== 'scene') {
      throw new TypeError('expected visual scene projection')
    }

    const firstStatementId = visualProjection.statements[0]?.id
    const secondStatementId = visualProjection.statements[1]?.id
    if (firstStatementId === undefined || secondStatementId === undefined) {
      throw new TypeError('expected two scene statements')
    }

    expect('collapsed' in visualProjection.statements[0]!).toBe(false)

    editorStore.setSceneStatementCollapsed(path, firstStatementId, true)
    editorStore.setSceneStatementCollapsed(path, secondStatementId, true)

    expect(editorStore.isSceneStatementCollapsed(path, firstStatementId)).toBe(true)
    expect(editorStore.isSceneStatementCollapsed(path, secondStatementId)).toBe(true)

    editorStore.applyTextDocumentContent(path, 'alpha!\nbeta')

    expect(editorStore.isSceneStatementCollapsed(path, firstStatementId)).toBe(false)
    expect(editorStore.isSceneStatementCollapsed(path, secondStatementId)).toBe(true)

    await emitFileRenamedEvent(path, renamedPath)

    expect(editorStore.isSceneStatementCollapsed(path, secondStatementId)).toBe(false)
    expect(editorStore.isSceneStatementCollapsed(renamedPath, secondStatementId)).toBe(true)

    editorStore.applySceneStatementDelete(renamedPath, secondStatementId)

    expect(editorStore.isSceneStatementCollapsed(renamedPath, secondStatementId)).toBe(false)
    expect(editorStore.isSceneStatementCollapsed(renamedPath, firstStatementId)).toBe(false)
  })

  it('在可视模式加载非法动画文件时保留原始文本草稿', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/animation/broken.json'

    preferenceStoreMock.editorMode = 'visual'
    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('{'))
    mimeGetTypeMock.mockReturnValue('application/json')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'broken.json',
      path,
      () => editorStore.currentTextProjection !== undefined && editorStore.currentVisualProjection !== undefined,
      'load invalid animation projections',
    )

    const textProjection = editorStore.currentTextProjection
    const visualProjection = editorStore.currentVisualProjection
    if (!textProjection || textProjection.projection !== 'text' || !visualProjection || visualProjection.projection !== 'visual') {
      throw new TypeError('expected both projections for invalid animation file')
    }

    expect(textProjection.kind).toBe('animation')
    expect(textProjection.textContent).toBe('{')
    expect(textProjection.syncError).toBe('invalid-animation-json')
    expect(textProjection.isDirty).toBe(false)
    expect(editorStore.canToggleMode).toBe(true)
    expect(toRaw(editorStore.currentState)).toBe(toRaw(visualProjection))

    await editorStore.saveFile(path)
    expect(textProjection.isDirty).toBe(false)
    const savedInvalidWrite = writeDocumentFileMock.mock.calls.at(-1) as [string, Uint8Array] | undefined
    expect(savedInvalidWrite?.[0]).toBe(path)
    expect(new TextDecoder().decode(savedInvalidWrite?.[1])).toBe('{')

    expect(toRaw(editorStore.currentState)).toBe(toRaw(editorStore.currentVisualProjection))
    expect(editorStore.currentTextProjection?.textContent).toBe('{')
    expect(editorStore.currentTextProjection?.syncError).toBe('invalid-animation-json')

    editorStore.setActiveProjection('text', path)
    editorStore.replaceTextDocumentContent(path, '[{"duration":200}]', { preserveDraftText: true })

    expect(editorStore.currentTextProjection?.syncError).toBeUndefined()
    expect(editorStore.currentTextProjection?.textContent).toBe('[{"duration":200}]')
    expect(editorStore.canToggleMode).toBe(true)

    editorStore.setActiveProjection('visual', path)

    expect(toRaw(editorStore.currentState)).toBe(toRaw(editorStore.currentVisualProjection))
    expect(editorStore.currentTextProjection?.textContent).toBe('[\n  {\n    "duration": 200\n  }\n]')
  })

  it('可视动画文件被外部替换为非法 JSON 时保持可视投影激活并保留原始草稿', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/animation/external-invalid.json'

    preferenceStoreMock.editorMode = 'visual'
    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('[{"duration":100}]'))
    mimeGetTypeMock.mockReturnValue('application/json')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'external-invalid.json',
      path,
      () => editorStore.currentTextProjection !== undefined && editorStore.currentVisualProjection !== undefined,
      'load animation projections before external invalidation',
    )

    editorStore.setActiveProjection('visual', path)
    expect(toRaw(editorStore.currentState)).toBe(toRaw(editorStore.currentVisualProjection))

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('{'))
    await emitFileModifiedEvent(path)

    const textProjection = editorStore.currentTextProjection
    if (!textProjection || textProjection.projection !== 'text') {
      throw new TypeError('expected text projection after external invalid animation update')
    }

    expect(toRaw(editorStore.currentState)).toBe(toRaw(editorStore.currentVisualProjection))
    expect(textProjection.textContent).toBe('{')
    expect(textProjection.textSource).toBe('draft')
    expect(textProjection.syncError).toBe('invalid-animation-json')
    expect(textProjection.isDirty).toBe(false)
    expect(editorStore.canToggleMode).toBe(true)
  })

  it('在文本模式保存时保留有效动画草稿文本，仅在进入可视模式后规范化', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/animation/draft.json'

    preferenceStoreMock.editorMode = 'text'
    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('[{"duration":100}]'))
    mimeGetTypeMock.mockReturnValue('application/json')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'draft.json',
      path,
      () => editorStore.currentTextProjection !== undefined && editorStore.currentVisualProjection !== undefined,
      'load animation draft projections',
    )

    const textProjection = editorStore.currentTextProjection
    if (!textProjection || textProjection.projection !== 'text') {
      throw new TypeError('expected text projection for animation file')
    }

    expect(editorStore.currentState).toBe(textProjection)
    expect(textProjection.textContent).toBe('[{"duration":100}]')
    expect(textProjection.textSource).toBe('draft')

    editorStore.replaceTextDocumentContent(path, '[{"duration":200}]', { preserveDraftText: true })

    expect(editorStore.currentTextProjection?.textContent).toBe('[{"duration":200}]')
    if (editorStore.currentVisualProjection?.projection === 'visual' && editorStore.currentVisualProjection.kind === 'animation') {
      expect(editorStore.currentVisualProjection.frames[0]).toMatchObject({ duration: 200 })
    } else {
      throw new TypeError('expected visual animation projection')
    }

    editorStore.setActiveProjection('visual', path)
    expect(editorStore.currentTextProjection?.textContent).toBe('[\n  {\n    "duration": 200\n  }\n]')

    editorStore.setActiveProjection('text', path)
    editorStore.replaceTextDocumentContent(path, '[{"duration":300}]', { preserveDraftText: true })
    expect(editorStore.currentTextProjection?.textContent).toBe('[{"duration":300}]')

    await editorStore.saveFile(path)

    expect(editorStore.currentTextProjection?.textContent).toBe('[{"duration":300}]')
    expect(editorStore.currentTextProjection?.textSource).toBe('draft')
    const lastWrite = writeDocumentFileMock.mock.calls.at(-1) as [string, Uint8Array] | undefined
    expect(lastWrite).toBeDefined()
    expect(lastWrite?.[0]).toBe(path)
    expect(new TextDecoder().decode(lastWrite?.[1])).toBe('[{"duration":300}]')

    editorStore.setActiveProjection('visual', path)
    expect(editorStore.currentTextProjection?.textContent).toBe('[\n  {\n    "duration": 300\n  }\n]')

    await editorStore.saveFile(path)
    expect(editorStore.currentTextProjection?.textContent).toBe('[\n  {\n    "duration": 300\n  }\n]')
  })

  it('在文本模式撤销重做时恢复有效动画草稿文本', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/animation/undo-redo.json'

    preferenceStoreMock.editorMode = 'text'
    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('[{"duration":100}]'))
    mimeGetTypeMock.mockReturnValue('application/json')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'undo-redo.json',
      path,
      () => editorStore.currentTextProjection !== undefined && editorStore.currentVisualProjection !== undefined,
      'load animation draft projection for undo/redo',
    )

    editorStore.replaceTextDocumentContent(path, '[{"duration":200}]', { preserveDraftText: true })
    expect(editorStore.currentTextProjection?.textContent).toBe('[{"duration":200}]')

    const undoResult = editorStore.undoDocument(path)

    expect(undoResult.applied).toBe(true)
    expect(editorStore.currentTextProjection?.textContent).toBe('[{"duration":100}]')
    expect(editorStore.currentTextProjection?.textSource).toBe('draft')
    if (editorStore.currentVisualProjection?.projection === 'visual' && editorStore.currentVisualProjection.kind === 'animation') {
      expect(editorStore.currentVisualProjection.frames[0]).toMatchObject({ duration: 100 })
    } else {
      throw new TypeError('expected visual animation projection')
    }

    const redoResult = editorStore.redoDocument(path)

    expect(redoResult.applied).toBe(true)
    expect(editorStore.currentTextProjection?.textContent).toBe('[{"duration":200}]')
    expect(editorStore.currentTextProjection?.textSource).toBe('draft')
    if (editorStore.currentVisualProjection?.projection === 'visual' && editorStore.currentVisualProjection.kind === 'animation') {
      expect(editorStore.currentVisualProjection.frames[0]).toMatchObject({ duration: 200 })
    } else {
      throw new TypeError('expected visual animation projection')
    }
  })

  it('支持动画可视化投影事务', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/animation/example.json'

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('[{"duration":100}]'))
    mimeGetTypeMock.mockReturnValue('application/json')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'example.json',
      path,
      () => editorStore.currentVisualProjection !== undefined,
      'load animation visual projection',
    )

    editorStore.setActiveProjection('visual', path)

    const visualProjection = editorStore.currentVisualProjection
    if (!visualProjection || visualProjection.projection !== 'visual' || visualProjection.kind !== 'animation') {
      throw new TypeError('expected visual animation projection')
    }

    editorStore.applyAnimationFrameUpdate(path, 0, { ease: 'linear' })
    expect(visualProjection.frames[0]).toMatchObject({ duration: 100, ease: 'linear' })

    editorStore.applyAnimationFrameInsert(path, 0, { duration: 200, ease: 'easeInOut' })
    expect(visualProjection.frames).toHaveLength(2)
    expect(visualProjection.frames[1]).toMatchObject({ duration: 200, ease: 'easeInOut' })

    editorStore.applyAnimationFrameReorder(path, 1, 0)
    expect(visualProjection.frames[0]).toMatchObject({ duration: 200, ease: 'easeInOut' })

    editorStore.applyAnimationFrameDelete(path, 1)
    expect(visualProjection.frames).toHaveLength(1)
    expect(visualProjection.frames[0]).toMatchObject({ duration: 200, ease: 'easeInOut' })
  })

  it('保存期间收到新编辑时保持文档脏状态', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/docs/save-race.txt'
    const writeDeferred = createDeferred<void>()

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('hello'))
    writeDocumentFileMock.mockImplementationOnce(async () => {
      await writeDeferred.promise
    })

    const editorStore = useEditorStore()

    await openTabAndWaitFor(tabsStore, 'save-race.txt', path, () => editorStore.hasState(path), 'load save race document')

    const loadedState = editorStore.getState(path)
    if (!loadedState || !('projection' in loadedState) || loadedState.projection !== 'text') {
      throw new TypeError('expected text editor state')
    }

    editorStore.applyTextDocumentContent(path, 'hello!')

    const savePromise = editorStore.saveFile(path)

    editorStore.applyTextDocumentContent(path, 'hello!?')

    writeDeferred.resolve()
    await savePromise

    expect(loadedState.textContent).toBe('hello!?')
    expect(loadedState.isDirty).toBe(true)
  })

  it('对相同文档路径的自动保存请求去重', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/docs/auto-save-dedupe.txt'

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('hello'))

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'auto-save-dedupe.txt',
      path,
      () => editorStore.hasState(path),
      'load auto-save dedupe document',
    )

    editorStore.applyTextDocumentContent(path, 'hello!')

    vi.useFakeTimers()
    try {
      editorStore.scheduleAutoSave(path)
      editorStore.scheduleAutoSave(path)

      await vi.advanceTimersByTimeAsync(499)
      expect(writeDocumentFileMock).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(writeDocumentFileMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('手动保存先完成时取消待执行的自动保存', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/docs/auto-save-cancelled-by-manual.txt'

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('hello'))

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'auto-save-cancelled-by-manual.txt',
      path,
      () => editorStore.hasState(path),
      'load manual save cancellation document',
    )

    editorStore.applyTextDocumentContent(path, 'hello!')

    vi.useFakeTimers()
    try {
      editorStore.scheduleAutoSave(path)
      await editorStore.saveFile(path)

      expect(writeDocumentFileMock).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(500)
      expect(writeDocumentFileMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('从文本投影保存后同步场景预览', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/scene/text-save-preview.txt'

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('hello'))
    mimeGetTypeMock.mockReturnValue('text/plain')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'text-save-preview.txt',
      path,
      () => editorStore.currentTextProjection !== undefined && editorStore.currentVisualProjection !== undefined,
      'load text save preview projections',
    )

    editorStore.applyTextDocumentContent(path, 'hello!')
    editorStore.syncSceneSelectionFromTextLine(path, 1)

    await editorStore.saveFile(path)

    expect(syncSceneMock).toHaveBeenCalledWith(path, 1, 'hello!', false)
  })

  it('将外部合并走 replace-all 事务流程并保持撤销历史完整', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/scene/external-merge.txt'

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('local'))
    mimeGetTypeMock.mockReturnValue('text/plain')
    externalDocumentModalAction = 'merge'

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'external-merge.txt',
      path,
      () => editorStore.hasState(path),
      'load external merge document',
    )

    const textProjection = editorStore.getState(path)
    if (!textProjection || !('projection' in textProjection) || textProjection.projection !== 'text') {
      throw new TypeError('expected text editor state')
    }

    editorStore.applyTextDocumentContent(path, 'local!')

    expect(textProjection.textContent).toBe('local!')
    expect(textProjection.isDirty).toBe(true)

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('remote\r\nchange'))
    await emitFileModifiedEvent(path)

    expect(textProjection.textContent).toBe(
      '<<<<<<< LOCAL\r\nlocal!\r\n=======\r\nremote\r\nchange\r\n>>>>>>> EXTERNAL',
    )
    expect(textProjection.isDirty).toBe(true)

    expect(editorStore.undoDocument(path).applied).toBe(true)
    expect(textProjection.textContent).toBe('local!')

    expect(editorStore.redoDocument(path).applied).toBe(true)
    expect(textProjection.textContent).toBe(
      '<<<<<<< LOCAL\r\nlocal!\r\n=======\r\nremote\r\nchange\r\n>>>>>>> EXTERNAL',
    )
  })

  it('将非 UTF-8 文本文件加载为不支持状态', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/scene/non-utf8.txt'

    readFileMock.mockResolvedValueOnce(new Uint8Array([0xFF, 0xFE, 0x66, 0x00]))
    mimeGetTypeMock.mockReturnValue('text/plain')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'non-utf8.txt',
      path,
      () => editorStore.hasState(path),
      'load unsupported encoding document',
    )

    const state = editorStore.getState(path)
    expect(state).toBeDefined()
    expect(state && 'view' in state ? state.view : undefined).toBe('unsupported')
    if (!state || !('view' in state) || state.view !== 'unsupported') {
      throw new TypeError('expected unsupported editor state')
    }
  })

  it('将文件类型检测失败暴露为标签错误', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/scene/detect-failed.txt'

    isBinaryFileMock.mockRejectedValueOnce(new Error('detector offline'))
    mimeGetTypeMock.mockReturnValue('text/plain')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'detect-failed.txt',
      path,
      () => tabsStore.activeTab?.path === path && tabsStore.activeTab?.isLoading === false,
      'load file type detection failure',
    )

    expect(editorStore.hasState(path)).toBe(false)
    expect(tabsStore.activeTab?.error).toContain('检测文件类型失败')
  })

  it('合并文档后续保存时使用外部元数据', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/scene/external-merge-encoding.txt'

    readFileMock.mockResolvedValueOnce(new Uint8Array(encodeTextFile('local', {
      lineEnding: '\n',
      // eslint-disable-next-line unicorn/text-encoding-identifier-case -- 项目文件元数据约定使用 'utf-8'
      encoding: 'utf-8',
    })))
    mimeGetTypeMock.mockReturnValue('text/plain')
    externalDocumentModalAction = 'merge'

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'external-merge-encoding.txt',
      path,
      () => editorStore.hasState(path),
      'load external merge encoding document',
    )

    editorStore.applyTextDocumentContent(path, 'local!')

    readFileMock.mockResolvedValueOnce(new Uint8Array(encodeTextFile('remote\nchange', {
      lineEnding: '\r\n',
      encoding: 'utf-8-bom',
    })))
    await emitFileModifiedEvent(path)

    await editorStore.saveFile(path)

    const lastWrite = writeDocumentFileMock.mock.calls.at(-1) as [string, Uint8Array] | undefined
    expect(lastWrite).toBeDefined()
    expect(lastWrite?.[0]).toBe(path)
    expect([...lastWrite?.[1] ?? []]).toEqual([...encodeTextFile(
      '<<<<<<< LOCAL\r\nlocal!\r\n=======\r\nremote\r\nchange\r\n>>>>>>> EXTERNAL',
      {
        lineEnding: '\r\n',
        encoding: 'utf-8-bom',
      },
    )])
  })

  it('忽略由自身保存触发的文件修改回响', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/scene/save-echo.txt'

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('hello'))
    mimeGetTypeMock.mockReturnValue('text/plain')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(tabsStore, 'save-echo.txt', path, () => editorStore.hasState(path), 'load save echo document')

    const state = editorStore.getState(path)
    if (!state || !('projection' in state) || state.projection !== 'text') {
      throw new TypeError('expected text editor state')
    }

    editorStore.applyTextDocumentContent(path, 'hello!')

    await editorStore.saveFile(path)

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('hello!'))
    await emitFileModifiedEvent(path)

    expect(modalOpenMock).not.toHaveBeenCalled()
    expect(state.textContent).toBe('hello!')
    expect(state.isDirty).toBe(false)
  })

  it('接受干净的外部文档替换后重置撤销重做历史', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/docs/external-reload-clean.txt'

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('hello'))

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'external-reload-clean.txt',
      path,
      () => editorStore.hasState(path),
      'load external reload clean document',
    )

    const state = editorStore.getState(path)
    if (!state || !('projection' in state) || state.projection !== 'text') {
      throw new TypeError('expected text editor state')
    }

    editorStore.applyTextDocumentContent(path, 'hello!')
    await editorStore.saveFile(path)

    expect(state.textContent).toBe('hello!')
    expect(state.isDirty).toBe(false)

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('world'))
    await emitFileModifiedEvent(path)

    expect(state.textContent).toBe('world')
    expect(state.isDirty).toBe(false)
    expect(editorStore.undoDocument(path).applied).toBe(false)
    expect(editorStore.redoDocument(path).applied).toBe(false)
  })

  it('切换到可视模式后仍可保存非法动画草稿并保持草稿完整', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/animation/invalid.json'

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('[{"duration":100}]'))
    mimeGetTypeMock.mockReturnValue('application/json')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'invalid.json',
      path,
      () => editorStore.currentTextProjection !== undefined && editorStore.currentVisualProjection !== undefined,
      'load invalid animation projections',
    )

    editorStore.setActiveProjection('text', path)
    editorStore.setTextProjectionDraft(path, '{', 'invalid-animation-json')

    expect(editorStore.currentTextProjection?.syncError).toBe('invalid-animation-json')
    expect(editorStore.canToggleMode).toBe(true)

    await editorStore.saveFile(path)
    expect(editorStore.currentTextProjection?.isDirty).toBe(false)
    const savedInvalidWrite = writeDocumentFileMock.mock.calls.at(-1) as [string, Uint8Array] | undefined
    expect(savedInvalidWrite?.[0]).toBe(path)
    expect(new TextDecoder().decode(savedInvalidWrite?.[1])).toBe('{')

    editorStore.setActiveProjection('visual', path)
    expect(toRaw(editorStore.currentState)).toBe(toRaw(editorStore.currentVisualProjection))
    expect(editorStore.currentTextProjection?.textContent).toBe('{')
    expect(editorStore.currentTextProjection?.syncError).toBe('invalid-animation-json')

    editorStore.setActiveProjection('text', path)
    editorStore.replaceTextDocumentContent(path, '[{"duration":200}]', { preserveDraftText: true })

    expect(editorStore.currentTextProjection?.syncError).toBeUndefined()
    expect(editorStore.currentTextProjection?.textContent).toBe('[{"duration":200}]')
    expect(editorStore.canToggleMode).toBe(true)
    if (editorStore.currentVisualProjection?.projection === 'visual' && editorStore.currentVisualProjection.kind === 'animation') {
      expect(editorStore.currentVisualProjection.frames[0]).toMatchObject({ duration: 200 })
    } else {
      throw new TypeError('expected visual animation projection')
    }
  })

  it('动画草稿恢复到已保存内容时同步恢复干净脏状态', async () => {
    const tabsStore = useTabsStore()
    const path = '/game/animation/dirty-reset.json'

    readFileMock.mockResolvedValueOnce(new TextEncoder().encode('[{"duration":100}]'))
    mimeGetTypeMock.mockReturnValue('application/json')

    const editorStore = useEditorStore()

    await openTabAndWaitFor(
      tabsStore,
      'dirty-reset.json',
      path,
      () => editorStore.currentTextProjection !== undefined,
      'load animation text projection',
    )

    const originalContent = editorStore.currentTextProjection?.textContent
    if (!originalContent) {
      throw new TypeError('expected animation text projection content')
    }

    editorStore.setTextProjectionDraft(path, `${originalContent}x`, 'invalid-animation-json')
    expect(editorStore.currentTextProjection?.isDirty).toBe(true)

    editorStore.replaceTextDocumentContent(path, originalContent, { preserveDraftText: true })
    expect(editorStore.currentTextProjection?.isDirty).toBe(false)
  })
})
