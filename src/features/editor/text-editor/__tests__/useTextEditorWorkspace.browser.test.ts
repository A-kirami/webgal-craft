import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

import { createBrowserTestPlugins } from '~/__tests__/browser'
import { AbsPath } from '~/domain/path'

const {
  tabsStoreState,
  useFileSystemEventsMock,
  useTabsWatcherMock,
  useTabsStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  tabsStoreState: {
    activeTab: undefined as { path: AbsPath } | undefined,
    shouldFocusEditor: false,
    tabs: [] as { path: AbsPath }[],
  },
  useFileSystemEventsMock: vi.fn(),
  useTabsWatcherMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: useFileSystemEventsMock,
}))

vi.mock('~/features/editor/shared/useTabsWatcher', () => ({
  useTabsWatcher: useTabsWatcherMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

import { useTextEditorWorkspace } from '../useTextEditorWorkspace'

interface EditorViewState {
  contributionsState: Record<string, unknown>
  cursorState: {
    inSelectionMode: boolean
    position: {
      column: number
      lineNumber: number
    }
    selectionStart: {
      column: number
      lineNumber: number
    }
  }[]
  viewState: {
    firstPosition: {
      column: number
      lineNumber: number
    }
    firstPositionDeltaTop: number
    scrollLeft: number
    scrollTop: number
  }
}

interface EditorPosition {
  column: number
  lineNumber: number
}

interface EditorStub {
  getModel: () => {
    uri: {
      toString: () => string
    }
  }
  getPosition: () => EditorPosition
  getSelections: () => unknown[]
  restoreViewState: (viewState: EditorViewState) => void
  saveViewState: () => EditorViewState
}

interface WorkspaceHarnessOptions {
  editor: EditorStub
  initializeSceneSelectionFromRestoredCursor?: () => void
  path: AbsPath
  restoreOnMount?: boolean
}

interface WorkspaceHarness {
  focusEditor: ReturnType<typeof vi.fn>
  restoreViewState: (path: AbsPath) => void
  saveViewState: (
    path: AbsPath,
    options?: { persistSessionRecovery?: boolean },
  ) => void
  unmount: () => Promise<void>
}

let currentPinia = createPinia()
const fileSystemEventHandlers = new Map<string, (event: { newPath: AbsPath, oldPath: AbsPath }) => void>()
const windowsScenePath = AbsPath.from(String.raw`X:\Project\WebGALCraft\game\scene.txt`)
const windowsSceneModelUri = 'X:/Project/WebGALCraft/game/scene.txt'

function createViewState(scrollTop: number): EditorViewState {
  return {
    cursorState: [{
      inSelectionMode: false,
      position: {
        column: 1,
        lineNumber: 3,
      },
      selectionStart: {
        column: 1,
        lineNumber: 3,
      },
    }],
    viewState: {
      firstPosition: {
        column: 1,
        lineNumber: 2,
      },
      firstPositionDeltaTop: 6,
      scrollLeft: 12,
      scrollTop,
    },
    contributionsState: {},
  }
}

function createEditor(path: AbsPath, viewState: EditorViewState): EditorStub {
  let position = {
    column: viewState.cursorState[0]?.position.column ?? 1,
    lineNumber: viewState.cursorState[0]?.position.lineNumber ?? 1,
  }
  const model = {
    uri: {
      toString: vi.fn(() => path === windowsScenePath ? windowsSceneModelUri : path),
    },
  }

  return {
    getModel: vi.fn(() => model),
    getPosition: vi.fn(() => position),
    getSelections: vi.fn(() => []),
    restoreViewState: vi.fn((restoredViewState: EditorViewState) => {
      const restoredPosition = restoredViewState.cursorState[0]?.position
      if (!restoredPosition) {
        return
      }

      position = {
        column: restoredPosition.column,
        lineNumber: restoredPosition.lineNumber,
      }
    }),
    saveViewState: vi.fn(() => viewState),
  }
}

function renderWorkspaceHarness(options: WorkspaceHarnessOptions): WorkspaceHarness {
  const focusEditor = vi.fn()
  const editorRef = shallowRef(options.editor)
  let workspaceApi: ReturnType<typeof useTextEditorWorkspace> | undefined
  setActivePinia(currentPinia)

  const Harness = defineComponent({
    setup() {
      workspaceApi = useTextEditorWorkspace({
        editorRef: editorRef as unknown as Parameters<typeof useTextEditorWorkspace>[0]['editorRef'],
        focusEditor,
        initializeSceneSelectionFromRestoredCursor: options.initializeSceneSelectionFromRestoredCursor ?? vi.fn(),
        isCurrentTabPreview: () => false,
        shouldPersistPersistentViewState: () => true,
      })

      onMounted(() => {
        if (!options.restoreOnMount) {
          return
        }

        workspaceApi?.restoreViewState(options.path, { isCreating: true })
      })

      return () => h('div')
    },
  })

  const { plugins } = createBrowserTestPlugins({
    i18nMode: 'lite',
    pinia: currentPinia,
  })
  const result = render(Harness, {
    global: {
      plugins,
    },
  })

  return {
    focusEditor,
    restoreViewState(path: AbsPath) {
      workspaceApi?.restoreViewState(path, { isCreating: true })
    },
    saveViewState(path: AbsPath, options: { persistSessionRecovery?: boolean } = {}) {
      workspaceApi?.saveViewState(path, options)
    },
    async unmount() {
      await result.unmount()
    },
  }
}

async function emitDirectoryRenamedEvent(oldPath: AbsPath, newPath: AbsPath) {
  const handler = fileSystemEventHandlers.get('directory:renamed')
  if (!handler) {
    throw new TypeError('missing directory:renamed handler')
  }

  await handler({ oldPath, newPath })
}

describe('useTextEditorWorkspace', () => {
  beforeEach(() => {
    currentPinia = createPinia()
    setActivePinia(currentPinia)
    fileSystemEventHandlers.clear()
    tabsStoreState.activeTab = undefined
    tabsStoreState.shouldFocusEditor = false
    tabsStoreState.tabs = []

    useFileSystemEventsMock.mockReset()
    useTabsWatcherMock.mockReset()
    useTabsStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    useFileSystemEventsMock.mockReturnValue({
      on: vi.fn((event: string, handler: (payload: { newPath: AbsPath, oldPath: AbsPath }) => void) => {
        fileSystemEventHandlers.set(event, handler)
        return () => {
          fileSystemEventHandlers.delete(event)
        }
      }),
    })
    useTabsWatcherMock.mockReturnValue(vi.fn())
    useTabsStoreMock.mockReturnValue(tabsStoreState)
    useWorkspaceStoreMock.mockReturnValue({
      currentGame: {
        id: 'game-1',
      },
    })
  })

  afterEach(() => {
    globalThis.localStorage.clear()
    globalThis.sessionStorage.clear()
  })

  it('pagehide 后重新挂载会按原始文件路径恢复之前的滚动视图状态', async () => {
    const path = windowsScenePath
    const savedViewState = createViewState(240)

    tabsStoreState.activeTab = { path }
    tabsStoreState.tabs = [{ path }]

    const firstEditor = createEditor(path, savedViewState)
    const firstHarness = renderWorkspaceHarness({
      editor: firstEditor,
      path,
    })

    await nextTick()

    globalThis.dispatchEvent(new Event('pagehide'))

    expect(firstEditor.saveViewState).toHaveBeenCalledOnce()

    await firstHarness.unmount()

    const secondEditor = createEditor(path, createViewState(0))
    const secondHarness = renderWorkspaceHarness({
      editor: secondEditor,
      path,
      restoreOnMount: true,
    })

    await nextTick()

    expect(secondEditor.restoreViewState).toHaveBeenCalledOnce()
    expect(secondEditor.restoreViewState).toHaveBeenCalledWith(savedViewState)

    await secondHarness.unmount()
  })

  it('目录重命名后会沿新路径恢复已缓存的编辑器视图状态，并保留恢复出的光标行', async () => {
    const oldRoot = AbsPath.from(String.raw`X:\Project\WebGALCraft\game\scene`)
    const newRoot = AbsPath.from(String.raw`X:\Project\WebGALCraft\game\story`)
    const oldPath = AbsPath.from(String.raw`X:\Project\WebGALCraft\game\scene\chapter\start.txt`)
    const newPath = AbsPath.from(String.raw`X:\Project\WebGALCraft\game\story\chapter\start.txt`)
    const savedViewState = createViewState(240)
    const editor = createEditor(oldPath, savedViewState)
    let restoredCursorLine: number | undefined

    const harness = renderWorkspaceHarness({
      editor,
      initializeSceneSelectionFromRestoredCursor: () => {
        restoredCursorLine = editor.getPosition().lineNumber
      },
      path: oldPath,
    })

    harness.saveViewState(oldPath)
    await emitDirectoryRenamedEvent(oldRoot, newRoot)
    harness.restoreViewState(newPath)

    expect(editor.restoreViewState).toHaveBeenCalledOnce()
    expect(editor.restoreViewState).toHaveBeenCalledWith(savedViewState)
    expect(restoredCursorLine).toBe(3)

    await harness.unmount()
  })

  it('目录重命名后重新挂载会按新路径恢复之前保存的视图状态', async () => {
    const oldRoot = AbsPath.from(String.raw`X:\Project\WebGALCraft\game\scene`)
    const newRoot = AbsPath.from(String.raw`X:\Project\WebGALCraft\game\story`)
    const oldPath = AbsPath.from(String.raw`X:\Project\WebGALCraft\game\scene\chapter\start.txt`)
    const newPath = AbsPath.from(String.raw`X:\Project\WebGALCraft\game\story\chapter\start.txt`)
    const savedViewState = createViewState(320)

    const firstHarness = renderWorkspaceHarness({
      editor: createEditor(oldPath, savedViewState),
      path: oldPath,
    })

    firstHarness.saveViewState(oldPath, { persistSessionRecovery: true })
    await emitDirectoryRenamedEvent(oldRoot, newRoot)
    await firstHarness.unmount()

    const secondEditor = createEditor(newPath, createViewState(0))
    const secondHarness = renderWorkspaceHarness({
      editor: secondEditor,
      path: newPath,
      restoreOnMount: true,
    })

    await nextTick()

    expect(secondEditor.restoreViewState).toHaveBeenCalledOnce()
    expect(secondEditor.restoreViewState).toHaveBeenCalledWith(savedViewState)

    await secondHarness.unmount()
  })
})
