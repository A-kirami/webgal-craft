import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'

import {
  createBrowserContainerStub,
  createBrowserInputStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import AssetView from './AssetView.vue'

import type { Component, PropType } from 'vue'
import type { FileSystemItem } from '~/stores/file'
import type { FileViewerItem } from '~/types/file-viewer'

const {
  createFileMock,
  createFolderMock,
  fileSystemEventHandlers,
  fileSystemEventsOnMock,
  fileViewerScrollToIndexMock,
  gameAssetDirMock,
  getFolderContentsMock,
  handleErrorMock,
  joinMock,
  renameFileMock,
  useFileStoreMock,
  usePreferenceStoreMock,
  useTabsStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  createFileMock: vi.fn(),
  createFolderMock: vi.fn(),
  fileSystemEventHandlers: new Map<string, ((event: Record<string, unknown>) => void)[]>(),
  fileSystemEventsOnMock: vi.fn(),
  fileViewerScrollToIndexMock: vi.fn(),
  gameAssetDirMock: vi.fn(),
  getFolderContentsMock: vi.fn(),
  handleErrorMock: vi.fn(),
  joinMock: vi.fn(),
  renameFileMock: vi.fn(),
  useFileStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

function emitFileSystemEvent(type: string, event: Record<string, unknown>): void {
  for (const handler of fileSystemEventHandlers.get(type) ?? []) {
    handler(event)
  }
}

vi.mock('@tauri-apps/api/path', async () => {
  const actual = await vi.importActual<typeof import('@tauri-apps/api/path')>('@tauri-apps/api/path')

  return {
    ...actual,
    basename: vi.fn(async (filePath: string) => filePath.split(/[/\\]/).at(-1) ?? ''),
    dirname: vi.fn(async (filePath: string) => filePath.replace(/[\\/][^\\/]+$/, '')),
    extname: vi.fn(async (filePath: string) => {
      const match = /\.[^./\\]+$/.exec(filePath)
      return match?.[0] ?? ''
    }),
    join: joinMock,
    normalize: vi.fn(async (filePath: string) => filePath.replaceAll('\\', '/')),
    sep: '/',
  }
})

vi.mock('~/components/editor/FileTreeContextMenuContent.vue', async () => {
  const { defineComponent, h } = await vi.importActual<typeof import('vue')>('vue')

  return {
    default: defineComponent({
      name: 'StubFileTreeContextMenuContent',
      props: {
        item: {
          type: Object,
          required: true,
        },
        isRoot: {
          type: Boolean,
          default: false,
        },
        onRename: {
          type: Function,
          default: undefined,
        },
        onCreateFolder: {
          type: Function,
          default: undefined,
        },
        onCreateFile: {
          type: Function,
          default: undefined,
        },
      },
      setup(props) {
        return () => h('div', {
          'data-testid': props.isRoot ? 'file-tree-context-menu-root' : `file-tree-context-menu-item-${(props.item as FileViewerItem).name}`,
          'data-item-name': (props.item as FileViewerItem).name,
          'data-item-path': (props.item as FileViewerItem).path,
          'data-is-root': String(props.isRoot),
        }, [
          h('button', {
            'type': 'button',
            'data-testid': `rename-action-${(props.item as FileViewerItem).name}`,
            'onClick': () => {
              ;(props.onRename as ((item: FileViewerItem) => void) | undefined)?.(props.item as FileViewerItem)
            },
          }, 'rename'),
          ...(props.onCreateFolder
            ? [
                h('button', {
                  'type': 'button',
                  'data-testid': `create-folder-action-${(props.item as FileViewerItem).name}`,
                  'onClick': () => {
                    ;(props.onCreateFolder as ((item: FileViewerItem) => void) | undefined)?.(props.item as FileViewerItem)
                  },
                }, 'create-folder'),
              ]
            : []),
          ...(props.onCreateFile
            ? [
                h('button', {
                  'type': 'button',
                  'data-testid': `create-file-action-${(props.item as FileViewerItem).name}`,
                  'onClick': () => {
                    ;(props.onCreateFile as ((item: FileViewerItem) => void) | undefined)?.(props.item as FileViewerItem)
                  },
                }, 'create-file'),
              ]
            : []),
        ])
      },
    }),
  }
})

vi.mock('~/components/ui/popover', async () => {
  const { defineComponent, h } = await vi.importActual<typeof import('vue')>('vue')

  return {
    PopoverAnchor: defineComponent({
      name: 'StubPopoverAnchor',
      setup(_, { slots }) {
        return () => h('div', { 'data-testid': 'popover-anchor' }, slots.default?.())
      },
    }),
  }
})

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: () => ({
    on: fileSystemEventsOnMock,
  }),
}))

vi.mock('~/services/game-fs', () => ({
  gameFs: {
    createFile: createFileMock,
    createFolder: createFolderMock,
    renameFile: renameFileMock,
  },
}))

vi.mock('~/services/platform/app-paths', () => ({
  gameAssetDir: gameAssetDirMock,
}))

vi.mock('~/stores/file', () => ({
  useFileStore: useFileStoreMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: handleErrorMock,
}))

function createPreviewFileViewerStub() {
  return defineComponent({
    name: 'StubPreviewFileViewer',
    props: {
      previewBaseUrl: {
        type: String,
        required: false,
      },
      previewCwd: {
        type: String,
        required: false,
      },
    },
    setup(props, { expose }) {
      expose({
        scrollToIndex: fileViewerScrollToIndexMock,
        scrollToItemPath: vi.fn(),
        viewport: undefined,
      })

      return () => h('output', {
        'data-testid': 'preview-context',
        'data-preview-base-url': props.previewBaseUrl ?? '',
        'data-preview-cwd': props.previewCwd ?? '',
      })
    },
  })
}

function createRenameFileViewerStub() {
  return defineComponent({
    name: 'StubRenameFileViewer',
    props: {
      highlightedItemPath: {
        type: String,
        default: undefined,
      },
      items: {
        type: Array as PropType<FileViewerItem[]>,
        required: true,
      },
    },
    setup(props, { expose, slots }) {
      const viewportRef = ref<HTMLElement>()
      const scrollToItemPath = vi.fn()

      expose({
        scrollToIndex: fileViewerScrollToIndexMock,
        scrollToItemPath,
        get viewport() {
          return viewportRef.value
        },
      })

      return () => h('div', { ref: viewportRef }, [
        ...(props.items ?? []).map(item =>
          h('div', {
            'key': item.path,
            'data-file-viewer-path': item.path,
            'data-highlighted': String(item.path === props.highlightedItemPath),
            'data-testid': `file-viewer-item-${item.name}`,
          }, [
            h('div', { 'data-file-viewer-name': 'true' }, item.name),
            ...(slots['context-menu']?.({ item }) ?? []),
          ]),
        ),
        ...(slots['background-context-menu']?.() ?? []),
      ])
    },
  })
}

function createVirtualizedRenameFileViewerStub() {
  return defineComponent({
    name: 'StubVirtualizedRenameFileViewer',
    props: {
      highlightedItemPath: {
        type: String,
        default: undefined,
      },
      items: {
        type: Array as PropType<FileViewerItem[]>,
        required: true,
      },
    },
    setup(props, { expose, slots }) {
      const viewportRef = ref<HTMLElement>()
      const visibleIndex = ref(3)

      function scrollToIndex(index: number) {
        fileViewerScrollToIndexMock(index)
        visibleIndex.value = index
      }

      function scrollToItemPath(path: string) {
        const targetIndex = props.items.findIndex(item => item.path === path)
        if (targetIndex === -1) {
          return
        }

        scrollToIndex(targetIndex)
      }

      expose({
        scrollToIndex,
        scrollToItemPath,
        get viewport() {
          return viewportRef.value
        },
      })

      return () => h('div', { ref: viewportRef }, [
        ...(props.items ?? [])
          .filter((_, index) => index === visibleIndex.value)
          .map(item =>
            h('div', {
              'key': item.path,
              'data-file-viewer-path': item.path,
              'data-highlighted': String(item.path === props.highlightedItemPath),
              'data-testid': `file-viewer-item-${item.name}`,
            }, [
              h('div', { 'data-file-viewer-name': 'true' }, item.name),
              ...(slots['context-menu']?.({ item }) ?? []),
            ]),
          ),
        ...(slots['background-context-menu']?.() ?? []),
      ])
    },
  })
}

function createContextMenuFileViewerStub() {
  return defineComponent({
    name: 'StubContextMenuFileViewer',
    props: {
      items: {
        type: Array as PropType<FileViewerItem[]>,
        required: true,
      },
    },
    setup(_props, { expose, slots }) {
      expose({
        scrollToIndex: fileViewerScrollToIndexMock,
        scrollToItemPath: vi.fn(),
        viewport: undefined,
      })

      return () => h('div', [
        ...(slots['background-context-menu']?.() ?? []),
      ])
    },
  })
}

function createLoadingStateFileViewerStub() {
  return defineComponent({
    name: 'StubLoadingStateFileViewer',
    props: {
      isLoading: {
        type: Boolean,
        default: false,
      },
      items: {
        type: Array as PropType<FileViewerItem[]>,
        required: true,
      },
    },
    setup(props, { expose }) {
      expose({
        scrollToIndex: fileViewerScrollToIndexMock,
        scrollToItemPath: vi.fn(),
        viewport: undefined,
      })

      return () => h('div', [
        h('output', { 'data-testid': 'file-viewer-loading' }, String(props.isLoading)),
        h('output', { 'data-testid': 'file-viewer-item-count' }, String(props.items.length)),
      ])
    },
  })
}

function createHarness(
  assetType: string = 'bg',
  options: {
    currentPath?: string
    searchQuery?: string
  } = {},
) {
  return defineComponent({
    name: 'AssetViewHarness',
    setup() {
      const currentPath = ref(options.currentPath ?? '')

      return () => h(AssetView as Component, {
        assetType,
        'searchQuery': options.searchQuery,
        'current-path': currentPath.value,
        'onUpdate:current-path': (value: string) => {
          currentPath.value = value
        },
      })
    },
  })
}

function createCreateFolderAndChangePathHarness(assetType: string = 'bg') {
  return defineComponent({
    name: 'AssetViewCreateFolderAndChangePathHarness',
    setup() {
      const currentPath = ref('')
      const assetViewRef = ref<{ createFolderInCurrentDirectory: () => Promise<void> }>()

      function handleCreateFolderAndChangePath() {
        void assetViewRef.value?.createFolderInCurrentDirectory()
        currentPath.value = 'chapter-1'
      }

      return () => h('div', [
        h('button', {
          'data-testid': 'create-folder-and-change-path',
          'onClick': handleCreateFolderAndChangePath,
          'type': 'button',
        }, 'create-folder-and-change-path'),
        h(AssetView as Component, {
          'ref': assetViewRef,
          assetType,
          'current-path': currentPath.value,
          'onUpdate:current-path': (value: string) => {
            currentPath.value = value
          },
        }),
      ])
    },
  })
}

const commonGlobalStubs = {
  Input: createBrowserInputStub('StubInput'),
  Popover: createBrowserContainerStub('StubPopover'),
  PopoverContent: createBrowserContainerStub('StubPopoverContent'),
}

describe('AssetView', () => {
  beforeEach(() => {
    fileSystemEventHandlers.clear()
    fileSystemEventsOnMock.mockReset()
    createFileMock.mockReset()
    createFolderMock.mockReset()
    fileViewerScrollToIndexMock.mockReset()
    gameAssetDirMock.mockReset()
    getFolderContentsMock.mockReset()
    handleErrorMock.mockReset()
    joinMock.mockReset()
    renameFileMock.mockReset()
    useFileStoreMock.mockReset()
    usePreferenceStoreMock.mockReset()
    useTabsStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    gameAssetDirMock.mockResolvedValue('/games/demo/assets/bg')
    getFolderContentsMock.mockResolvedValue([])
    joinMock.mockImplementation(async (...paths: string[]) => paths.filter(Boolean).join('/'))
    createFileMock.mockResolvedValue('/project/background/新建文件.json')
    createFolderMock.mockResolvedValue('/project/background/新建文件夹')
    renameFileMock.mockResolvedValue('/project/background/hero-renamed.png')

    useFileStoreMock.mockReturnValue({
      getFolderContents: getFolderContentsMock,
    })
    usePreferenceStoreMock.mockReturnValue(reactive({
      assetViewMode: 'grid',
      assetZoom: [100],
    }))
    useTabsStoreMock.mockReturnValue({
      findTabIndex: vi.fn(() => -1),
      fixPreviewTab: vi.fn(),
      openTab: vi.fn(),
      tabs: [],
    })
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/games/demo',
      },
      currentGameServeUrl: 'http://127.0.0.1:8899/game/demo/',
    }))
    fileSystemEventsOnMock.mockImplementation((eventType: string, handler: (event: Record<string, unknown>) => void) => {
      const handlers = fileSystemEventHandlers.get(eventType) ?? []
      handlers.push(handler)
      fileSystemEventHandlers.set(eventType, handlers)
      return () => {
        const currentHandlers = fileSystemEventHandlers.get(eventType) ?? []
        fileSystemEventHandlers.set(
          eventType,
          currentHandlers.filter(currentHandler => currentHandler !== handler),
        )
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('会向 FileViewer 传递图片预览上下文', async () => {
    renderInBrowser(createHarness(), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createPreviewFileViewerStub(),
        },
      },
    })

    await expect.element(page.getByTestId('preview-context')).toHaveAttribute('data-preview-cwd', '/games/demo')
    await expect.element(page.getByTestId('preview-context')).toHaveAttribute('data-preview-base-url', 'http://127.0.0.1:8899/game/demo/')
  })

  it('右键重命名会以 Popover 形式打开并调用 gameFs.renameFile', async () => {
    gameAssetDirMock.mockResolvedValue('/project/background')
    getFolderContentsMock.mockResolvedValue([
      {
        createdAt: 1,
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 2,
        name: 'hero.png',
        path: '/project/background/hero.png',
        size: 1024,
      },
    ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
      currentGameServeUrl: undefined,
    }))

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createRenameFileViewerStub(),
        },
      },
    })

    await expect.element(page.getByTestId('rename-action-hero.png')).toBeVisible()

    await page.getByTestId('rename-action-hero.png').click()

    const textbox = page.getByRole('textbox')
    await expect.element(textbox).toHaveValue('hero.png')

    await textbox.fill('hero-renamed.png')
    await userEvent.keyboard('{Enter}')

    expect(renameFileMock).toHaveBeenCalledWith('/project/background/hero.png', 'hero-renamed.png')
    expect(handleErrorMock).not.toHaveBeenCalled()
  })

  it('重命名时会高亮当前项并在关闭后取消高亮', async () => {
    gameAssetDirMock.mockResolvedValue('/project/background')
    getFolderContentsMock.mockResolvedValue([
      {
        createdAt: 1,
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 2,
        name: 'hero.png',
        path: '/project/background/hero.png',
        size: 1024,
      },
      {
        createdAt: 1,
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 3,
        name: 'villain.png',
        path: '/project/background/villain.png',
        size: 2048,
      },
    ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
      currentGameServeUrl: undefined,
    }))

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createRenameFileViewerStub(),
        },
      },
    })

    const heroItem = page.getByTestId('file-viewer-item-hero.png')
    const villainItem = page.getByTestId('file-viewer-item-villain.png')

    await expect.element(heroItem).toHaveAttribute('data-highlighted', 'false')
    await expect.element(villainItem).toHaveAttribute('data-highlighted', 'false')

    await page.getByTestId('rename-action-hero.png').click()

    await expect.element(heroItem).toHaveAttribute('data-highlighted', 'true')
    await expect.element(villainItem).toHaveAttribute('data-highlighted', 'false')

    await userEvent.keyboard('{Escape}')

    await expect.element(heroItem).toHaveAttribute('data-highlighted', 'false')
    await expect.element(villainItem).toHaveAttribute('data-highlighted', 'false')
  })

  it('网格模式下重命名 Popover 会居中对齐', async () => {
    gameAssetDirMock.mockResolvedValue('/project/background')
    getFolderContentsMock.mockResolvedValue([
      {
        createdAt: 1,
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 2,
        name: 'hero.png',
        path: '/project/background/hero.png',
        size: 1024,
      },
    ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
      currentGameServeUrl: undefined,
    }))

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createRenameFileViewerStub(),
        },
      },
    })

    await page.getByTestId('rename-action-hero.png').click()

    const popoverContent = document.querySelector('[side="bottom"]')
    expect(popoverContent?.getAttribute('align')).toBe('center')
  })

  it('列表模式下重命名 Popover 仍保持左对齐', async () => {
    gameAssetDirMock.mockResolvedValue('/project/background')
    getFolderContentsMock.mockResolvedValue([
      {
        createdAt: 1,
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 2,
        name: 'hero.png',
        path: '/project/background/hero.png',
        size: 1024,
      },
    ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
      currentGameServeUrl: undefined,
    }))
    usePreferenceStoreMock.mockReturnValue(reactive({
      assetViewMode: 'list',
      assetZoom: [100],
    }))

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createRenameFileViewerStub(),
        },
      },
    })

    await page.getByTestId('rename-action-hero.png').click()

    const popoverContent = document.querySelector('[side="bottom"]')
    expect(popoverContent?.getAttribute('align')).toBe('start')
  })

  it('重命名输入框会按内容自动宽度并只保留最大宽度约束', async () => {
    gameAssetDirMock.mockResolvedValue('/project/background')
    getFolderContentsMock.mockResolvedValue([
      {
        createdAt: 1,
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 2,
        name: 'hero-with-a-very-long-name.png',
        path: '/project/background/hero-with-a-very-long-name.png',
        size: 1024,
      },
    ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
      currentGameServeUrl: undefined,
    }))

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createRenameFileViewerStub(),
        },
      },
    })

    await page.getByTestId('rename-action-hero-with-a-very-long-name.png').click()

    const popoverContent = document.querySelector('[side="bottom"]')
    const textbox = await page.getByRole('textbox').element()

    expect(popoverContent?.className).toContain('w-auto')
    expect(popoverContent?.className).toContain('max-w-56')
    expect(textbox.className).toContain('field-sizing-content')
    expect(textbox.className).toContain('w-auto')
    expect(textbox.classList.contains('w-full')).toBe(false)
    expect(textbox.className).toContain('max-w-full')
  })

  it('当前目录收到文件创建事件后会重新读取并刷新列表', async () => {
    vi.useFakeTimers()
    getFolderContentsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 2,
          name: 'new-file.png',
          path: '/games/demo/assets/bg/new-file.png',
          size: 2048,
        },
      ])

    renderInBrowser(createHarness(), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createRenameFileViewerStub(),
        },
      },
    })

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(1)
    })
    await expect.element(page.getByText('new-file.png')).not.toBeInTheDocument()

    emitFileSystemEvent('file:created', {
      type: 'file:created',
      path: '/games/demo/assets/bg/new-file.png',
    })

    await vi.advanceTimersByTimeAsync(100)
    await nextTick()

    expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    await expect.element(page.getByText('new-file.png')).toBeVisible()
  })

  it('相关文件系统事件后紧跟无关事件时仍会保留刷新请求', async () => {
    vi.useFakeTimers()
    getFolderContentsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 2,
          name: 'new-file.png',
          path: '/games/demo/assets/bg/new-file.png',
          size: 2048,
        },
      ])

    renderInBrowser(createHarness(), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createRenameFileViewerStub(),
        },
      },
    })

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(1)
    })

    emitFileSystemEvent('file:created', {
      type: 'file:created',
      path: '/games/demo/assets/bg/new-file.png',
    })
    emitFileSystemEvent('file:created', {
      type: 'file:created',
      path: '/games/demo/assets/bgm/ignore-me.png',
    })

    await vi.advanceTimersByTimeAsync(100)
    await nextTick()

    expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    await expect.element(page.getByText('new-file.png')).toBeVisible()
  })

  it('父目录删除事件也会触发当前子目录刷新', async () => {
    vi.useFakeTimers()

    renderInBrowser(createHarness('bg', { currentPath: 'chapter-1' }), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createContextMenuFileViewerStub(),
        },
      },
    })

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(1)
    })

    emitFileSystemEvent('directory:removed', {
      type: 'directory:removed',
      path: '/games/demo/assets/bg',
    })

    await vi.advanceTimersByTimeAsync(100)
    await nextTick()

    expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    expect(getFolderContentsMock).toHaveBeenLastCalledWith('/games/demo/assets/bg/chapter-1')
  })

  it('父目录重命名事件也会触发当前子目录刷新', async () => {
    vi.useFakeTimers()

    renderInBrowser(createHarness('bg', { currentPath: 'chapter-1' }), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createContextMenuFileViewerStub(),
        },
      },
    })

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(1)
    })

    emitFileSystemEvent('directory:renamed', {
      type: 'directory:renamed',
      oldPath: '/games/demo/assets/bg',
      newPath: '/games/demo/assets/bg-renamed',
    })

    await vi.advanceTimersByTimeAsync(100)
    await nextTick()

    expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    expect(getFolderContentsMock).toHaveBeenLastCalledWith('/games/demo/assets/bg/chapter-1')
  })

  it('静默刷新覆盖普通加载后仍会正确清除 loading 状态', async () => {
    vi.useFakeTimers()

    let resolveFirstLoad: ((items: FileSystemItem[]) => void) | undefined
    const firstLoad = new Promise<FileSystemItem[]>((resolve) => {
      resolveFirstLoad = resolve
    })

    getFolderContentsMock
      .mockReturnValueOnce(firstLoad)
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 2,
          name: 'new-file.png',
          path: '/games/demo/assets/bg/new-file.png',
          size: 2048,
        },
      ])

    renderInBrowser(createHarness(), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createLoadingStateFileViewerStub(),
        },
      },
    })

    await expect.element(page.getByTestId('file-viewer-loading')).toHaveTextContent('true')

    emitFileSystemEvent('file:created', {
      type: 'file:created',
      path: '/games/demo/assets/bg/new-file.png',
    })

    await vi.advanceTimersByTimeAsync(100)
    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    })
    await expect.element(page.getByTestId('file-viewer-item-count')).toHaveTextContent('1')

    resolveFirstLoad?.([])
    await nextTick()

    await expect.element(page.getByTestId('file-viewer-loading')).toHaveTextContent('false')
  })

  it('静默刷新与路径切换同批触发时，显式导航仍会显示 loading', async () => {
    vi.useFakeTimers()

    let resolveSecondLoad: ((items: FileSystemItem[]) => void) | undefined
    let resolveThirdLoad: ((items: FileSystemItem[]) => void) | undefined
    const secondLoad = new Promise<FileSystemItem[]>((resolve) => {
      resolveSecondLoad = resolve
    })
    const thirdLoad = new Promise<FileSystemItem[]>((resolve) => {
      resolveThirdLoad = resolve
    })

    createFolderMock.mockResolvedValue('/games/demo/assets/bg/new-folder')
    getFolderContentsMock
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(secondLoad)
      .mockReturnValueOnce(thirdLoad)

    renderInBrowser(createCreateFolderAndChangePathHarness(), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createLoadingStateFileViewerStub(),
        },
      },
    })

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(1)
    })

    await page.getByTestId('create-folder-and-change-path').click()

    await vi.waitFor(() => {
      expect(createFolderMock).toHaveBeenCalledWith('/games/demo/assets/bg', 'edit.fileTree.defaultFolderName')
      expect(getFolderContentsMock).toHaveBeenCalledTimes(3)
    })

    expect(getFolderContentsMock).toHaveBeenNthCalledWith(2, '/games/demo/assets/bg')
    expect(getFolderContentsMock).toHaveBeenLastCalledWith('/games/demo/assets/bg/chapter-1')
    await expect.element(page.getByTestId('file-viewer-loading')).toHaveTextContent('true')

    resolveSecondLoad?.([])
    resolveThirdLoad?.([])
    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()
  })

  it('会为文件视图空白区提供当前目录右键菜单', async () => {
    gameAssetDirMock.mockResolvedValue('/project/background')

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createContextMenuFileViewerStub(),
        },
      },
    })

    await expect.element(page.getByTestId('file-tree-context-menu-root')).toHaveAttribute('data-item-path', '/project/background')
    await expect.element(page.getByTestId('file-tree-context-menu-root')).toHaveAttribute('data-item-name', 'background')
    await expect.element(page.getByTestId('file-tree-context-menu-root')).toHaveAttribute('data-is-root', 'true')
  })

  it('仅 animation 和 template 目录的右键菜单会显示创建文件入口', async () => {
    gameAssetDirMock.mockResolvedValue('/project/assets/animation')

    renderInBrowser(createHarness('animation'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createContextMenuFileViewerStub(),
        },
      },
    })

    await expect.element(page.getByTestId('create-file-action-animation')).toBeVisible()

    document.body.innerHTML = ''
    gameAssetDirMock.mockResolvedValue('/project/assets/template')

    renderInBrowser(createHarness('template'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createContextMenuFileViewerStub(),
        },
      },
    })

    await expect.element(page.getByTestId('create-file-action-template')).toBeVisible()

    document.body.innerHTML = ''
    gameAssetDirMock.mockResolvedValue('/project/assets/background')

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createContextMenuFileViewerStub(),
        },
      },
    })

    await expect.element(page.getByTestId('file-tree-context-menu-root')).toBeVisible()
    await expect.element(page.getByTestId('create-file-action-background')).not.toBeInTheDocument()
  })

  it('animation 空白区右键菜单新建文件后会创建 .json 文件并打开重命名 Popover', async () => {
    vi.useFakeTimers()
    gameAssetDirMock.mockResolvedValue('/project/assets/animation')
    createFileMock.mockResolvedValue('/project/assets/animation/新建文件.json')
    getFolderContentsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'application/json',
          modifiedAt: 2,
          name: '新建文件.json',
          path: '/project/assets/animation/新建文件.json',
          size: 0,
        },
      ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
      currentGameServeUrl: undefined,
    }))

    renderInBrowser(createHarness('animation'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createRenameFileViewerStub(),
        },
      },
    })

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(1)
    })
    await page.getByTestId('create-file-action-animation').click()

    expect(createFileMock).toHaveBeenCalledWith('/project/assets/animation', 'edit.fileTree.defaultFileStem.json')

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    })
    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()

    await expect.element(page.getByRole('textbox')).toHaveValue('新建文件.json')
  })

  it('template 空白区右键菜单新建文件时会使用 .scss 默认后缀', async () => {
    gameAssetDirMock.mockResolvedValue('/project/assets/template')

    renderInBrowser(createHarness('template'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createContextMenuFileViewerStub(),
        },
      },
    })

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(1)
    })
    await page.getByTestId('create-file-action-template').click()

    expect(createFileMock).toHaveBeenCalledWith('/project/assets/template', 'edit.fileTree.defaultFileStem.scss')
  })

  it('空白区右键菜单新建文件夹后会创建目录并打开重命名 Popover', async () => {
    vi.useFakeTimers()
    gameAssetDirMock.mockResolvedValue('/project/background')
    getFolderContentsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: true,
          modifiedAt: 2,
          name: '新建文件夹',
          path: '/project/background/新建文件夹',
          size: 0,
        },
      ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
      currentGameServeUrl: undefined,
    }))

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createRenameFileViewerStub(),
        },
      },
    })

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(1)
    })
    await page.getByTestId('create-folder-action-background').click()

    expect(createFolderMock).toHaveBeenCalledWith('/project/background', 'edit.fileTree.defaultFolderName')

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    })
    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()

    await expect.element(page.getByRole('textbox')).toHaveValue('新建文件夹')
  })

  it('创建文件夹后如果已切换目录，则不会继续打开旧目录的重命名 Popover', async () => {
    vi.useFakeTimers()
    gameAssetDirMock.mockResolvedValue('/project/background')
    createFolderMock.mockResolvedValue('/project/background/新建文件夹')
    getFolderContentsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
      currentGameServeUrl: undefined,
    }))

    renderInBrowser(createCreateFolderAndChangePathHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createRenameFileViewerStub(),
        },
      },
    })

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(1)
    })

    await page.getByTestId('create-folder-and-change-path').click()

    await vi.waitFor(() => {
      expect(createFolderMock).toHaveBeenCalledWith('/project/background', 'edit.fileTree.defaultFolderName')
      expect(getFolderContentsMock).toHaveBeenCalledTimes(3)
    })

    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()

    await expect.element(page.getByRole('textbox')).not.toBeInTheDocument()
  })

  it('搜索结果中隐藏新建目录时仍会打开重命名 Popover', async () => {
    vi.useFakeTimers()
    gameAssetDirMock.mockResolvedValue('/project/background')
    getFolderContentsMock
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 2,
          name: 'hero.png',
          path: '/project/background/hero.png',
          size: 1024,
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: true,
          modifiedAt: 2,
          name: '新建文件夹',
          path: '/project/background/新建文件夹',
          size: 0,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 2,
          name: 'hero.png',
          path: '/project/background/hero.png',
          size: 1024,
        },
      ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
      currentGameServeUrl: undefined,
    }))

    renderInBrowser(createHarness('background', { searchQuery: 'hero' }), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createRenameFileViewerStub(),
        },
      },
    })

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(1)
    })
    await page.getByTestId('create-folder-action-background').click()

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    })
    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()

    await expect.element(page.getByRole('textbox')).toHaveValue('新建文件夹')
  })

  it('大型虚拟列表中新建文件夹时会先滚动到目标项再打开重命名 Popover', async () => {
    vi.useFakeTimers()
    gameAssetDirMock.mockResolvedValue('/project/background')
    getFolderContentsMock
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 2,
          name: 'hero-1.png',
          path: '/project/background/hero-1.png',
          size: 1024,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 3,
          name: 'hero-2.png',
          path: '/project/background/hero-2.png',
          size: 1024,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 4,
          name: 'hero-3.png',
          path: '/project/background/hero-3.png',
          size: 1024,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 5,
          name: 'hero-4.png',
          path: '/project/background/hero-4.png',
          size: 1024,
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: true,
          modifiedAt: 2,
          name: '新建文件夹',
          path: '/project/background/新建文件夹',
          size: 0,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 2,
          name: 'hero-1.png',
          path: '/project/background/hero-1.png',
          size: 1024,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 3,
          name: 'hero-2.png',
          path: '/project/background/hero-2.png',
          size: 1024,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 4,
          name: 'hero-3.png',
          path: '/project/background/hero-3.png',
          size: 1024,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 5,
          name: 'hero-4.png',
          path: '/project/background/hero-4.png',
          size: 1024,
        },
      ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
      currentGameServeUrl: undefined,
    }))

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createVirtualizedRenameFileViewerStub(),
        },
      },
    })

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(1)
    })
    await page.getByTestId('create-folder-action-background').click()

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    })
    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()

    expect(fileViewerScrollToIndexMock).toHaveBeenCalledWith(0)
    await expect.element(page.getByRole('textbox')).toHaveValue('新建文件夹')
  })

  it('当前目录已有默认文件夹名时会自动追加序号再创建', async () => {
    gameAssetDirMock.mockResolvedValue('/project/background')
    getFolderContentsMock.mockResolvedValue([
      {
        createdAt: 1,
        isDir: true,
        modifiedAt: 2,
        name: 'edit.fileTree.defaultFolderName',
        path: '/project/background/edit.fileTree.defaultFolderName',
        size: 0,
      },
    ])

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createContextMenuFileViewerStub(),
        },
      },
    })

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(1)
    })
    await page.getByTestId('create-folder-action-background').click()

    expect(createFolderMock).toHaveBeenCalledWith('/project/background', 'edit.fileTree.defaultFolderName 2')
  })
})
