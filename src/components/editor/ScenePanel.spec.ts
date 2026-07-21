import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { renderInBrowser } from '~/__tests__/browser-render'

const {
  fileSystemEventHandlers,
  fileSystemEventsOnMock,
  gameSceneDirMock,
  scrollIntoViewMock,
  useFileStoreMock,
  useEditorDiagnosticsStoreMock,
  useTabsStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  fileSystemEventHandlers: new Map<string, (event: unknown) => void>(),
  fileSystemEventsOnMock: vi.fn(),
  gameSceneDirMock: vi.fn(),
  scrollIntoViewMock: vi.fn(),
  useFileStoreMock: vi.fn(),
  useEditorDiagnosticsStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('~/services/platform/app-paths', () => ({
  defaultEngineSavePath: vi.fn(),
  defaultGameSavePath: vi.fn(),
  defaultTemplateSavePath: vi.fn(),
  engineIconPath: vi.fn(),
  engineTemplateDir: vi.fn(),
  gameAssetDir: vi.fn((gamePath: string, assetType: string) => `${gamePath}/game/${assetType}`),
  gameConfigPath: vi.fn((gamePath: string) => `${gamePath}/game/config.txt`),
  gameCoverPath: vi.fn((gamePath: string, fileName: string) => `${gamePath}/game/background/${fileName}`),
  gameIconPath: vi.fn((gamePath: string) => `${gamePath}/icons/favicon.ico`),
  gameRootDir: vi.fn((gamePath: string) => `${gamePath}/game`),
  gameSceneDir: gameSceneDirMock,
  projectConfigPath: vi.fn((gamePath: string) => `${gamePath}/project.wgcp`),
  templateManifestPath: vi.fn(),
}))

vi.mock('~/stores/file', () => ({
  useFileStore: useFileStoreMock,
}))

vi.mock('~/stores/editor-diagnostics', () => ({
  useEditorDiagnosticsStore: useEditorDiagnosticsStoreMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: () => ({
    on: fileSystemEventsOnMock,
  }),
}))

import ScenePanel from './ScenePanel.vue'

interface FileSystemItem {
  id: string
  isDir: boolean
  name: string
  path: string
}

interface TreeNode {
  children?: TreeNode[]
  id: string
  name: string
  path: string
}

interface TestTab {
  isPreview?: boolean
  path: string
}

function createRect(rect: Partial<DOMRect>): DOMRect {
  return {
    bottom: rect.bottom ?? 0,
    height: rect.height ?? 0,
    left: rect.left ?? 0,
    right: rect.right ?? 0,
    toJSON: () => ({}),
    top: rect.top ?? 0,
    width: rect.width ?? 0,
    x: rect.x ?? rect.left ?? 0,
    y: rect.y ?? rect.top ?? 0,
  } as DOMRect
}

function flattenNodes(items: TreeNode[]): TreeNode[] {
  return items.flatMap(item => [
    item,
    ...(item.children ? flattenNodes(item.children) : []),
  ])
}

const globalStubs = {
  Button: defineComponent({
    name: 'StubButton',
    emits: ['click'],
    setup(_, { attrs, emit, slots }) {
      return () => h('button', {
        ...attrs,
        type: 'button',
        onClick: (event: MouseEvent) => emit('click', event),
      }, slots.default?.())
    },
  }),
  FileTree: defineComponent({
    name: 'StubFileTree',
    props: {
      itemBadgeText: {
        type: Function,
        default: undefined,
      },
      itemDimmed: {
        type: Function,
        default: undefined,
      },
      itemSeverity: {
        type: Function,
        default: undefined,
      },
      items: {
        type: Array,
        required: true,
      },
      selectedItem: {
        type: Object,
        default: undefined,
      },
    },
    emits: ['auxclick', 'click', 'dblclick', 'update:selectedItem'],
    setup(props, { emit, expose }) {
      const viewportRef = shallowRef<HTMLElement>()

      function setViewportElement(element: unknown) {
        const viewport = element instanceof HTMLElement ? element : undefined
        viewportRef.value = viewport
        if (viewport) {
          viewport.getBoundingClientRect = () => createRect({
            bottom: 100,
            height: 100,
            right: 240,
            width: 240,
          })
        }
      }

      function setSelectedElement(element: unknown) {
        const selectedElement = element instanceof HTMLElement ? element : undefined
        if (!selectedElement) {
          return
        }

        selectedElement.getBoundingClientRect = () => createRect({
          bottom: 226,
          height: 26,
          right: 240,
          top: 200,
          width: 240,
          y: 200,
        })
        selectedElement.scrollIntoView = scrollIntoViewMock as typeof selectedElement.scrollIntoView
      }

      expose({
        getViewportElement: () => viewportRef.value,
      })

      function renderItems(items: TreeNode[]) {
        return flattenNodes(items).map((item) => {
          const badgeText = (props.itemBadgeText as ((item: TreeNode) => string | undefined) | undefined)?.(item)
          const isDimmed = (props.itemDimmed as ((item: TreeNode) => boolean) | undefined)?.(item) ?? false
          const severity = (props.itemSeverity as ((item: TreeNode) => string | undefined) | undefined)?.(item)
          const isSelected = (props.selectedItem as TreeNode | undefined)?.path === item.path

          return h('div', {
            key: item.path,
          }, [
            h('button', {
              'ref': isSelected ? setSelectedElement : undefined,
              'type': 'button',
              'data-selected': isSelected ? '' : undefined,
              'data-dimmed': isDimmed ? 'true' : 'false',
              'data-diagnostic-severity': severity,
              'onClick': () => emit('click', {
                hasChildren: Array.isArray(item.children),
                value: item,
              }),
            }, item.name),
            badgeText ? h('span', badgeText) : undefined,
          ])
        })
      }

      return () => h('div', {
        'ref': setViewportElement,
        'data-testid': 'scene-panel-viewport',
      }, renderItems(props.items as TreeNode[]))
    },
  }),
}

function createFileStore() {
  const entries = new Map<string, FileSystemItem[]>([
    ['/games/demo/game/scene', [
      {
        id: 'start',
        isDir: false,
        name: 'start.txt',
        path: '/games/demo/game/scene/start.txt',
      },
      {
        id: 'chapter',
        isDir: true,
        name: 'chapter-1',
        path: '/games/demo/game/scene/chapter-1',
      },
    ]],
    ['/games/demo/game/scene/chapter-1', [
      {
        id: 'branch',
        isDir: false,
        name: 'branch.txt',
        path: '/games/demo/game/scene/chapter-1/branch.txt',
      },
    ]],
  ])

  return {
    getFolderContents: vi.fn(async (path: string) => entries.get(path) ?? []),
    initialized: Promise.resolve(),
  }
}

function createTabsStore(activeTab?: TestTab) {
  return reactive({
    activeTab,
    tabs: [] as TestTab[],
    findTabIndex: vi.fn(() => -1),
    openTab: vi.fn(),
    fixPreviewTab: vi.fn(),
  })
}

describe('ScenePanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fileSystemEventHandlers.clear()

    fileSystemEventsOnMock.mockImplementation((eventType: string, handler: (event: unknown) => void) => {
      fileSystemEventHandlers.set(eventType, handler)
      return () => {
        fileSystemEventHandlers.delete(eventType)
      }
    })

    gameSceneDirMock.mockReturnValue('/games/demo/game/scene')
    useFileStoreMock.mockReturnValue(createFileStore())
    useEditorDiagnosticsStoreMock.mockReturnValue({
      getHighestSeverity: vi.fn(() => undefined),
    })
    useTabsStoreMock.mockReturnValue(createTabsStore())
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        id: 'game-1',
        path: '/games/demo',
      },
    }))
  })

  it('会读取场景目录并渲染文件树', async () => {
    renderInBrowser(ScenePanel, {
      browser: {
        i18nMode: 'localized',
        messages: {
          'zh-Hans': {
            edit: {},
          },
        },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('start.txt')).toBeVisible()
    await expect.element(page.getByText('branch.txt')).toBeVisible()

    const fileStore = useFileStoreMock.mock.results[0]?.value as ReturnType<typeof createFileStore>
    expect(fileStore.getFolderContents).toHaveBeenCalledWith('/games/demo/game/scene')
    expect(fileStore.getFolderContents).toHaveBeenCalledWith('/games/demo/game/scene/chapter-1')
  })

  it('只给诊断索引中存在问题的已分析场景文件着色', async () => {
    useEditorDiagnosticsStoreMock.mockReturnValue({
      getHighestSeverity: (path: string) => path.endsWith('/start.txt') ? 'error' : undefined,
    })

    renderInBrowser(ScenePanel, {
      browser: {
        i18nMode: 'localized',
        messages: {
          'zh-Hans': {
            edit: {},
          },
        },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('start.txt')).toBeVisible()

    expect(page.getByText('start.txt').element()).toHaveAttribute('data-diagnostic-severity', 'error')
    expect(page.getByText('branch.txt').element()).not.toHaveAttribute('data-diagnostic-severity')
    expect(page.getByText('chapter-1').element()).not.toHaveAttribute('data-diagnostic-severity')
  })

  it('点击文件时会通过 tabs store 打开标签页', async () => {
    const tabsStore = createTabsStore()

    useTabsStoreMock.mockReturnValue(tabsStore)

    renderInBrowser(ScenePanel, {
      browser: {
        i18nMode: 'localized',
        messages: {
          'zh-Hans': {
            edit: {},
          },
        },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByText('start.txt').click()

    expect(tabsStore.openTab).toHaveBeenCalledWith('start.txt', '/games/demo/game/scene/start.txt')
  })

  it('会监听目录修改事件以刷新 overlay 视图', async () => {
    renderInBrowser(ScenePanel, {
      browser: {
        i18nMode: 'localized',
        messages: {
          'zh-Hans': {
            edit: {},
          },
        },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('start.txt')).toBeVisible()
    expect(fileSystemEventHandlers.get('directory:modified')).toBeTypeOf('function')
  })

  it('点击刷新按钮会触发场景树重新读取', async () => {
    const fileStore = createFileStore()
    useFileStoreMock.mockReturnValue(fileStore)

    renderInBrowser(ScenePanel, {
      browser: {
        i18nMode: 'localized',
        messages: {
          'zh-Hans': {
            edit: {},
          },
        },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('start.txt')).toBeVisible()
    const initialCalls = fileStore.getFolderContents.mock.calls.length

    const refreshButton = document.querySelector<HTMLButtonElement>('[data-testid="scene-panel-refresh"]')!
    refreshButton.click()

    await vi.waitFor(() => {
      expect(fileStore.getFolderContents.mock.calls.length).toBeGreaterThan(initialCalls)
    })
  })

  it('文件系统目录创建事件会触发场景树重新读取', async () => {
    const fileStore = createFileStore()
    useFileStoreMock.mockReturnValue(fileStore)

    renderInBrowser(ScenePanel, {
      browser: {
        i18nMode: 'localized',
        messages: {
          'zh-Hans': {
            edit: {},
          },
        },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('start.txt')).toBeVisible()
    const initialCalls = fileStore.getFolderContents.mock.calls.length

    fileSystemEventHandlers.get('directory:created')?.({
      type: 'directory:created',
      path: '/games/demo/game/scene/chapter-2',
    })

    await vi.waitFor(() => {
      expect(fileStore.getFolderContents.mock.calls.length).toBeGreaterThan(initialCalls)
    })
  })

  it('active tab 路径变化时会滚动显示选中的场景文件', async () => {
    const tabsStore = createTabsStore()
    useTabsStoreMock.mockReturnValue(tabsStore)

    renderInBrowser(ScenePanel, {
      browser: {
        i18nMode: 'localized',
        messages: {
          'zh-Hans': {
            edit: {},
          },
        },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('branch.txt')).toBeVisible()
    expect(scrollIntoViewMock).not.toHaveBeenCalled()

    tabsStore.activeTab = {
      path: '/games/demo/game/scene/chapter-1/branch.txt',
    }

    await vi.waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledTimes(1)
    })
  })
})
