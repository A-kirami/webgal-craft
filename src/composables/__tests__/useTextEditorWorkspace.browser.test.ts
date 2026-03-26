import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

import { createBrowserTestPlugins } from '~/__tests__/browser'

const {
  tabsStoreState,
  useFileSystemEventsMock,
  useTabsWatcherMock,
  useTabsStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  tabsStoreState: {
    activeTab: undefined as { path: string } | undefined,
    shouldFocusEditor: false,
    tabs: [] as { path: string }[],
  },
  useFileSystemEventsMock: vi.fn(),
  useTabsWatcherMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: useFileSystemEventsMock,
}))

vi.mock('~/composables/useTabsWatcher', () => ({
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

interface EditorStub {
  getModel: ReturnType<typeof vi.fn>
  getSelections: ReturnType<typeof vi.fn>
  restoreViewState: ReturnType<typeof vi.fn>
  saveViewState: ReturnType<typeof vi.fn>
}

interface WorkspaceHarnessOptions {
  editor: EditorStub
  path: string
  restoreOnMount?: boolean
}

interface WorkspaceHarness {
  focusEditor: ReturnType<typeof vi.fn>
  unmount: () => Promise<void>
}

let currentPinia = createPinia()
const windowsScenePath = String.raw`X:\Project\WebGALCraft\game\scene.txt`
const windowsSceneModelUri = 'X:%5CProject%5CWebGALCraft%5Cgame%5Cscene.txt'

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

function createEditor(path: string, viewState: EditorViewState): EditorStub {
  const model = {
    uri: {
      toString: vi.fn(() => path === windowsScenePath ? windowsSceneModelUri : path),
    },
  }

  return {
    getModel: vi.fn(() => model),
    getSelections: vi.fn(() => []),
    restoreViewState: vi.fn(),
    saveViewState: vi.fn(() => viewState),
  }
}

function renderWorkspaceHarness(options: WorkspaceHarnessOptions): WorkspaceHarness {
  const focusEditor = vi.fn()
  const editorRef = shallowRef(options.editor)
  setActivePinia(currentPinia)

  const Harness = defineComponent({
    setup() {
      const workspace = useTextEditorWorkspace({
        editorRef: editorRef as unknown as Parameters<typeof useTextEditorWorkspace>[0]['editorRef'],
        focusEditor,
        initializeSceneSelectionFromRestoredCursor: vi.fn(),
        isCurrentTabPreview: () => false,
        shouldPersistPersistentViewState: () => true,
      })

      onMounted(() => {
        if (!options.restoreOnMount) {
          return
        }

        workspace.restoreViewState(options.path, { isCreating: true })
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
    async unmount() {
      await result.unmount()
    },
  }
}

describe('useTextEditorWorkspace 行为', () => {
  beforeEach(() => {
    currentPinia = createPinia()
    setActivePinia(currentPinia)
    tabsStoreState.activeTab = undefined
    tabsStoreState.shouldFocusEditor = false
    tabsStoreState.tabs = []

    useFileSystemEventsMock.mockReset()
    useTabsWatcherMock.mockReset()
    useTabsStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    useFileSystemEventsMock.mockReturnValue({
      on: vi.fn(() => vi.fn()),
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
})
