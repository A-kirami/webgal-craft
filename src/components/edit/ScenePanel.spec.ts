import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, reactive } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

const {
  fileSystemEventsOnMock,
  gameSceneDirMock,
  useFileStoreMock,
  useTabsStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  fileSystemEventsOnMock: vi.fn(),
  gameSceneDirMock: vi.fn(),
  useFileStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  basename: vi.fn(async (filePath: string) => filePath.split(/[/\\]/).at(-1) ?? ''),
  dirname: vi.fn(async (filePath: string) => filePath.replace(/[\\/][^\\/]+$/, '')),
  extname: vi.fn(async (filePath: string) => {
    const match = /\.[^./\\]+$/.exec(filePath)
    return match?.[0] ?? ''
  }),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
  normalize: vi.fn((filePath: string) => filePath.replaceAll('\\', '/')),
  sep: '/',
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('~/helper/app-paths', async importOriginal => ({
  ...(await importOriginal<typeof import('~/helper/app-paths')>()),
  defaultEngineSavePath: vi.fn(),
  defaultGameSavePath: vi.fn(),
  engineIconPath: vi.fn(),
  engineManifestPath: vi.fn(),
  gameAssetDir: vi.fn(async (gamePath: string, assetType: string) => `${gamePath}/game/${assetType}`),
  gameCoverPath: vi.fn(async (gamePath: string, fileName: string) => `${gamePath}/game/background/${fileName}`),
  gameIconPath: vi.fn(async (gamePath: string) => `${gamePath}/icons/favicon.ico`),
  gameRootDir: vi.fn(async (gamePath: string) => `${gamePath}/game`),
  gameSceneDir: gameSceneDirMock,
}))

vi.mock('~/stores/file', () => ({
  useFileStore: useFileStoreMock,
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
      items: {
        type: Array,
        required: true,
      },
    },
    emits: ['auxclick', 'click', 'dblclick', 'update:selectedItem'],
    setup(props, { emit }) {
      function renderItems(items: TreeNode[]) {
        return flattenNodes(items).map(item => h('button', {
          key: item.path,
          type: 'button',
          onClick: () => emit('click', {
            hasChildren: Array.isArray(item.children),
            value: item,
          }),
        }, item.name))
      }

      return () => h('div', renderItems(props.items as TreeNode[]))
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
  }
}

describe('ScenePanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    fileSystemEventsOnMock.mockReset()
    gameSceneDirMock.mockReset()
    useFileStoreMock.mockReset()
    useTabsStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    gameSceneDirMock.mockResolvedValue('/games/demo/game/scene')
    useFileStoreMock.mockReturnValue(createFileStore())
    useTabsStoreMock.mockReturnValue(reactive({
      activeTab: undefined,
      tabs: [],
      findTabIndex: vi.fn(() => -1),
      openTab: vi.fn(),
      fixPreviewTab: vi.fn(),
    }))
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        id: 'game-1',
        path: '/games/demo',
      },
    }))
  })

  it('会读取场景目录并渲染文件树', async () => {
    renderInBrowser(ScenePanel, {
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

  it('点击文件时会通过 tabs store 打开标签页', async () => {
    const tabsStore = reactive({
      activeTab: undefined,
      tabs: [],
      findTabIndex: vi.fn(() => -1),
      openTab: vi.fn(),
      fixPreviewTab: vi.fn(),
    })

    useTabsStoreMock.mockReturnValue(tabsStore)

    renderInBrowser(ScenePanel, {
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByText('start.txt').click()

    expect(tabsStore.openTab).toHaveBeenCalledWith('start.txt', '/games/demo/game/scene/start.txt')
  })
})
