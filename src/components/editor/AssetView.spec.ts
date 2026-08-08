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
import type { FileSystemDragPayload } from '~/types/drag-drop'
import type { FileViewerItem } from '~/types/file-viewer'

const {
  copyFileMock,
  createFileMock,
  createFolderMock,
  existsMock,
  fileSystemEventHandlers,
  fileSystemEventsOnMock,
  fileViewerScrollToIndexMock,
  getFolderContentsMock,
  handleErrorMock,
  pathOperationPerformMock,
  useFileStoreMock,
  usePreferenceStoreMock,
  usePreviewSessionStoreMock,
  useResourceIndexMock,
  useTabsStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  copyFileMock: vi.fn(),
  createFileMock: vi.fn(),
  createFolderMock: vi.fn(),
  existsMock: vi.fn(),
  fileSystemEventHandlers: new Map<string, ((event: Record<string, unknown>) => void)[]>(),
  fileSystemEventsOnMock: vi.fn(),
  fileViewerScrollToIndexMock: vi.fn(),
  getFolderContentsMock: vi.fn(),
  handleErrorMock: vi.fn(),
  pathOperationPerformMock: vi.fn(),
  useFileStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  usePreviewSessionStoreMock: vi.fn(),
  useResourceIndexMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', async importOriginal => ({
  ...await importOriginal<typeof import('@tauri-apps/plugin-fs')>(),
  exists: existsMock,
}))

function emitFileSystemEvent(type: string, event: Record<string, unknown>): void {
  for (const handler of fileSystemEventHandlers.get(type) ?? []) {
    handler(event)
  }
}

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
        revealInExplorerDisabled: {
          type: Boolean,
          default: false,
        },
      },
      setup(props) {
        return () => h('div', {
          'data-testid': props.isRoot ? 'file-tree-context-menu-root' : `file-tree-context-menu-item-${(props.item as FileViewerItem).name}`,
          'data-item-name': (props.item as FileViewerItem).name,
          'data-item-path': (props.item as FileViewerItem).path,
          'data-is-root': String(props.isRoot),
          'data-reveal-in-explorer-disabled': String(props.revealInExplorerDisabled),
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
    copyFile: copyFileMock,
    createFile: createFileMock,
    createFolder: createFolderMock,
  },
}))

vi.mock('~/services/path-operation', () => ({
  pathOperation: {
    perform: pathOperationPerformMock,
  },
}))

vi.mock('~/stores/file', () => ({
  useFileStore: useFileStoreMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/stores/preview-session', () => ({
  usePreviewSessionStore: usePreviewSessionStoreMock,
}))

vi.mock('~/services/resource-index/service', () => ({
  useResourceIndex: useResourceIndexMock,
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

function createReferenceCountFileViewerStub() {
  return defineComponent({
    name: 'StubReferenceCountFileViewer',
    props: {
      items: {
        type: Array as PropType<FileViewerItem[]>,
        required: true,
      },
    },
    setup(props) {
      return () => h('div', (props.items ?? []).map(item => h(
        'output',
        { 'data-testid': `reference-count-${item.name}` },
        String(item.referenceCount ?? 'unavailable'),
      )))
    },
  })
}

function createAuxClickFileViewerStub() {
  return defineComponent({
    name: 'StubAuxClickFileViewer',
    props: {
      items: {
        type: Array as PropType<FileViewerItem[]>,
        required: true,
      },
    },
    emits: ['auxclick'],
    setup(props, { emit }) {
      return () => {
        const fileItem = props.items.find(item => !item.isDir)

        return h('button', {
          'type': 'button',
          'data-testid': 'auxclick-file',
          'disabled': !fileItem,
          'onClick': () => {
            if (fileItem) {
              emit('auxclick', fileItem)
            }
          },
        }, 'auxclick')
      }
    },
  })
}

function createFileViewerDragPayload(item: FileViewerItem): FileSystemDragPayload {
  return {
    isDir: item.isDir,
    items: [{
      isDir: item.isDir,
      name: item.name,
      path: item.path,
    }],
    mimeType: item.mimeType,
    name: item.name,
    path: item.path,
    source: 'file-viewer',
    type: 'file-system-item',
  }
}

function createDragTransferFileViewerStub(operation: 'copy' | 'move' = 'move') {
  return defineComponent({
    name: 'StubDragTransferFileViewer',
    props: {
      canDropFileTransfer: {
        type: Function,
        default: undefined,
      },
      dropTargetDirectory: {
        type: Object as PropType<FileViewerItem>,
        default: undefined,
      },
      enableDragTransfer: {
        type: Boolean,
        default: false,
      },
      items: {
        type: Array as PropType<FileViewerItem[]>,
        required: true,
      },
    },
    emits: ['fileTransferDrop'],
    setup(props, { emit }) {
      return () => {
        const sourceItem = props.items.find(item => !item.isDir)
        const targetDirectory = props.items.find(item => item.isDir) ?? props.dropTargetDirectory
        const payload = sourceItem ? createFileViewerDragPayload(sourceItem) : undefined
        const canDrop = payload && targetDirectory && props.canDropFileTransfer
          ? props.canDropFileTransfer(payload, targetDirectory, operation)
          : false

        return h('div', [
          h('output', { 'data-testid': 'file-viewer-drag-enabled' }, String(props.enableDragTransfer)),
          h('output', { 'data-testid': 'file-viewer-root-drop-target' }, props.dropTargetDirectory?.path ?? ''),
          h('output', { 'data-testid': 'file-viewer-can-drop' }, String(canDrop)),
          h('button', {
            'type': 'button',
            'data-testid': 'emit-file-transfer-drop',
            'disabled': !payload || !targetDirectory,
            'onClick': () => {
              if (payload && targetDirectory) {
                emit('fileTransferDrop', payload, targetDirectory, operation)
              }
            },
          }, 'drop'),
        ])
      }
    },
  })
}

function createAssetFileSystemItem(options: {
  isDir: boolean
  modifiedAt: number
  name: string
  path: string
  mimeType?: string
  source?: FileSystemItem['source']
  size?: number
}) {
  return {
    createdAt: 1,
    modifiedAt: options.modifiedAt,
    name: options.name,
    path: options.path,
    size: options.size ?? 0,
    source: options.source,
    ...(options.isDir
      ? { isDir: true }
      : { isDir: false, mimeType: options.mimeType }),
  }
}

function mockDragTransferFolderContents(): void {
  getFolderContentsMock.mockResolvedValue([
    createAssetFileSystemItem({
      isDir: false,
      mimeType: 'image/png',
      modifiedAt: 2,
      name: 'hero.png',
      path: '/project/game/background/hero.png',
      size: 1024,
    }),
    createAssetFileSystemItem({
      isDir: true,
      modifiedAt: 3,
      name: 'folder',
      path: '/project/game/background/folder',
    }),
  ])
  useWorkspaceStoreMock.mockReturnValue(reactive({
    currentGame: {
      path: '/project',
    },
  }))
  setPreviewUnavailable()
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

let previewSessionStoreState: {
  currentGameServeUrl: string | undefined
}
let resourceIndexRevision = ref(0)
let resourceIndexStatus = ref<'idle' | 'building' | 'ready' | 'degraded'>('ready')

function setPreviewUnavailable() {
  previewSessionStoreState.currentGameServeUrl = undefined
}

describe('AssetView', () => {
  beforeEach(() => {
    fileSystemEventHandlers.clear()
    fileSystemEventsOnMock.mockReset()
    copyFileMock.mockReset()
    createFileMock.mockReset()
    createFolderMock.mockReset()
    existsMock.mockReset()
    fileViewerScrollToIndexMock.mockReset()
    getFolderContentsMock.mockReset()
    handleErrorMock.mockReset()
    pathOperationPerformMock.mockReset()
    useFileStoreMock.mockReset()
    usePreferenceStoreMock.mockReset()
    usePreviewSessionStoreMock.mockReset()
    useResourceIndexMock.mockReset()
    useTabsStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    getFolderContentsMock.mockResolvedValue([])
    existsMock.mockResolvedValue(true)
    copyFileMock.mockResolvedValue('/project/game/background/folder/hero.png')
    createFileMock.mockResolvedValue('/project/game/background/新建文件.json')
    createFolderMock.mockResolvedValue('/project/game/background/新建文件夹')
    pathOperationPerformMock.mockResolvedValue({
      cancelled: false,
      finalPath: '/project/game/background/hero-renamed.png',
      warnings: [],
    })

    useFileStoreMock.mockReturnValue({
      getFolderContents: getFolderContentsMock,
      getItemByPath: () => undefined,
      initialized: Promise.resolve(),
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
    previewSessionStoreState = reactive({
      currentGameServeUrl: 'http://127.0.0.1:8899/game/demo/',
    })
    usePreviewSessionStoreMock.mockReturnValue(previewSessionStoreState)
    resourceIndexRevision = ref(0)
    resourceIndexStatus = ref('ready')
    useResourceIndexMock.mockReturnValue({
      getReferencesTo: vi.fn(() => []),
      resolveByAbsolutePath: vi.fn(() => undefined),
      revision: resourceIndexRevision,
      status: resourceIndexStatus,
    })
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/games/demo',
      },
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

  it('会显示零引用和多个引用，并在资源索引修订后刷新计数', async () => {
    let heroReferenceCount = 2
    const resolveByAbsolutePath = vi.fn((path: string) => ({
      key: {
        assetType: 'background',
        relativePath: path.endsWith('/hero.png') ? 'hero.png' : 'unused.png',
        root: 'asset',
      },
    }))
    const getReferencesTo = vi.fn((key: { relativePath: string }) =>
      Array.from({ length: key.relativePath === 'hero.png' ? heroReferenceCount : 0 }),
    )
    useResourceIndexMock.mockReturnValue({
      getReferencesTo,
      resolveByAbsolutePath,
      revision: resourceIndexRevision,
      status: resourceIndexStatus,
    })
    getFolderContentsMock.mockResolvedValue([
      createAssetFileSystemItem({
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 2,
        name: 'hero.png',
        path: '/games/demo/game/background/hero.png',
      }),
      createAssetFileSystemItem({
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 3,
        name: 'unused.png',
        path: '/games/demo/game/background/unused.png',
      }),
    ])

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createReferenceCountFileViewerStub(),
        },
      },
    })

    await expect.element(page.getByTestId('reference-count-hero.png')).toHaveTextContent('2')
    await expect.element(page.getByTestId('reference-count-unused.png')).toHaveTextContent('0')
    expect(resolveByAbsolutePath).toHaveBeenCalledWith('/games/demo/game/background/hero.png')
    expect(getReferencesTo).toHaveBeenCalled()

    heroReferenceCount = 0
    resourceIndexRevision.value += 1

    await expect.element(page.getByTestId('reference-count-hero.png')).toHaveTextContent('0')
  })

  it('资源索引未就绪时不会把暂态状态显示为零引用', async () => {
    resourceIndexStatus.value = 'building'
    getFolderContentsMock.mockResolvedValue([
      createAssetFileSystemItem({
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 2,
        name: 'hero.png',
        path: '/games/demo/game/background/hero.png',
      }),
    ])

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createReferenceCountFileViewerStub(),
        },
      },
    })

    await expect.element(page.getByTestId('reference-count-hero.png')).toHaveTextContent('unavailable')
  })

  it('模板层文件不会显示引用计数', async () => {
    const resolveByAbsolutePath = vi.fn()
    const getReferencesTo = vi.fn()
    useResourceIndexMock.mockReturnValue({
      getReferencesTo,
      resolveByAbsolutePath,
      revision: resourceIndexRevision,
      status: resourceIndexStatus,
    })
    getFolderContentsMock.mockResolvedValue([
      createAssetFileSystemItem({
        isDir: false,
        mimeType: 'text/css',
        modifiedAt: 2,
        name: 'base.scss',
        path: '/games/demo/game/template/base.scss',
        source: 'templateLower',
      }),
    ])

    renderInBrowser(createHarness('template'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createReferenceCountFileViewerStub(),
        },
      },
    })

    await expect.element(page.getByTestId('reference-count-base.scss')).toHaveTextContent('unavailable')
    expect(resolveByAbsolutePath).not.toHaveBeenCalled()
    expect(getReferencesTo).not.toHaveBeenCalled()
  })

  it('FileViewer 上抛中键点击时会以普通标签打开资源', async () => {
    const openTab = vi.fn()
    useTabsStoreMock.mockReturnValue({
      findTabIndex: vi.fn(() => -1),
      fixPreviewTab: vi.fn(),
      openTab,
      tabs: [],
    })
    getFolderContentsMock.mockResolvedValue([
      createAssetFileSystemItem({
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 2,
        name: 'hero.png',
        path: '/project/game/background/hero.png',
        size: 1024,
      }),
    ])
    setPreviewUnavailable()

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createAuxClickFileViewerStub(),
        },
      },
    })

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(1)
    })
    await page.getByTestId('auxclick-file').click()

    expect(openTab).toHaveBeenCalledWith(
      'hero.png',
      '/project/game/background/hero.png',
      { forceNormal: true },
    )
  })

  it('右键重命名会以 Popover 形式打开并调用 pathOperation.perform', async () => {
    getFolderContentsMock.mockResolvedValue([
      {
        createdAt: 1,
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 2,
        name: 'hero.png',
        path: '/project/game/background/hero.png',
        size: 1024,
      },
    ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
    }))
    setPreviewUnavailable()

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

    expect(pathOperationPerformMock).toHaveBeenCalledWith({
      kind: 'rename',
      sourcePath: '/project/game/background/hero.png',
      target: { type: 'name', name: 'hero-renamed.png' },
    }, expect.any(Function))
    expect(handleErrorMock).not.toHaveBeenCalled()
  })

  it('重命名时会高亮当前项并在关闭后取消高亮', async () => {
    getFolderContentsMock.mockResolvedValue([
      {
        createdAt: 1,
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 2,
        name: 'hero.png',
        path: '/project/game/background/hero.png',
        size: 1024,
      },
      {
        createdAt: 1,
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 3,
        name: 'villain.png',
        path: '/project/game/background/villain.png',
        size: 2048,
      },
    ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
    }))
    setPreviewUnavailable()

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
    getFolderContentsMock.mockResolvedValue([
      {
        createdAt: 1,
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 2,
        name: 'hero.png',
        path: '/project/game/background/hero.png',
        size: 1024,
      },
    ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
    }))
    setPreviewUnavailable()

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
    getFolderContentsMock.mockResolvedValue([
      {
        createdAt: 1,
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 2,
        name: 'hero.png',
        path: '/project/game/background/hero.png',
        size: 1024,
      },
    ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
    }))
    setPreviewUnavailable()
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
    getFolderContentsMock.mockResolvedValue([
      {
        createdAt: 1,
        isDir: false,
        mimeType: 'image/png',
        modifiedAt: 2,
        name: 'hero-with-a-very-long-name.png',
        path: '/project/game/background/hero-with-a-very-long-name.png',
        size: 1024,
      },
    ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
    }))
    setPreviewUnavailable()

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
          path: '/games/demo/game/bg/new-file.png',
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
      path: '/games/demo/game/bg/new-file.png',
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
          path: '/games/demo/game/bg/new-file.png',
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
      path: '/games/demo/game/bg/new-file.png',
    })
    emitFileSystemEvent('file:created', {
      type: 'file:created',
      path: '/games/demo/game/bgm/ignore-me.png',
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
      path: '/games/demo/game/bg',
    })

    await vi.advanceTimersByTimeAsync(100)
    await nextTick()

    expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    expect(getFolderContentsMock).toHaveBeenLastCalledWith('/games/demo/game/bg/chapter-1')
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
      oldPath: '/games/demo/game/bg',
      newPath: '/games/demo/game/bg-renamed',
    })

    await vi.advanceTimersByTimeAsync(100)
    await nextTick()

    expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    expect(getFolderContentsMock).toHaveBeenLastCalledWith('/games/demo/game/bg/chapter-1')
  })

  it('归一化后逃出当前目录的事件不会触发刷新', async () => {
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

    emitFileSystemEvent('directory:modified', {
      type: 'directory:modified',
      path: '/games/demo/game/bg/chapter-1/../chapter-2',
    })

    await vi.advanceTimersByTimeAsync(100)
    await nextTick()

    expect(getFolderContentsMock).toHaveBeenCalledTimes(1)
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
          path: '/games/demo/game/bg/new-file.png',
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
      path: '/games/demo/game/bg/new-file.png',
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

    createFolderMock.mockResolvedValue('/games/demo/game/bg/new-folder')
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
      expect(createFolderMock).toHaveBeenCalledWith('/games/demo/game/bg', 'edit.fileTree.defaultFolderName')
      expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    })

    expect(getFolderContentsMock).toHaveBeenLastCalledWith('/games/demo/game/bg/chapter-1')
    await expect.element(page.getByTestId('file-viewer-loading')).toHaveTextContent('true')

    resolveSecondLoad?.([])
    resolveThirdLoad?.([])
    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()
  })

  it('会为文件视图空白区提供当前目录右键菜单', async () => {
    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createContextMenuFileViewerStub(),
        },
      },
    })

    await expect.element(page.getByTestId('file-tree-context-menu-root')).toHaveAttribute('data-item-path', '/games/demo/game/background')
    await expect.element(page.getByTestId('file-tree-context-menu-root')).toHaveAttribute('data-item-name', 'background')
    await expect.element(page.getByTestId('file-tree-context-menu-root')).toHaveAttribute('data-is-root', 'true')
  })

  it('资源根目录不存在时会禁用根目录菜单的打开文件夹操作', async () => {
    existsMock.mockResolvedValue(false)

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createContextMenuFileViewerStub(),
        },
      },
    })

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledOnce()
    })
    expect(existsMock).toHaveBeenCalledWith('/games/demo/game/background')
    await expect.element(page.getByTestId('file-tree-context-menu-root')).toHaveAttribute('data-reveal-in-explorer-disabled', 'true')
  })

  it('会把 FileViewer 的 move drop 交给 pathOperation 执行', async () => {
    mockDragTransferFolderContents()

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createDragTransferFileViewerStub('move'),
        },
      },
    })

    await expect.element(page.getByTestId('file-viewer-drag-enabled')).toHaveTextContent('true')
    await expect.element(page.getByTestId('file-viewer-root-drop-target')).toHaveTextContent('/project/game/background')
    await expect.element(page.getByTestId('file-viewer-can-drop')).toHaveTextContent('true')

    await page.getByTestId('emit-file-transfer-drop').click()

    expect(pathOperationPerformMock).toHaveBeenCalledWith({
      kind: 'move',
      sourcePath: '/project/game/background/hero.png',
      target: { type: 'directory', directory: '/project/game/background/folder' },
    }, expect.any(Function))
    expect(copyFileMock).not.toHaveBeenCalled()
    expect(handleErrorMock).not.toHaveBeenCalled()
  })

  it('会把 FileViewer 的 copy drop 交给 gameFs.copyFile 执行', async () => {
    mockDragTransferFolderContents()

    renderInBrowser(createHarness('background'), {
      global: {
        stubs: {
          ...commonGlobalStubs,
          FileViewer: createDragTransferFileViewerStub('copy'),
        },
      },
    })

    await expect.element(page.getByTestId('file-viewer-can-drop')).toHaveTextContent('true')
    await page.getByTestId('emit-file-transfer-drop').click()

    expect(copyFileMock).toHaveBeenCalledWith('/project/game/background/hero.png', '/project/game/background/folder')
    expect(pathOperationPerformMock).not.toHaveBeenCalled()
    expect(handleErrorMock).not.toHaveBeenCalled()
  })

  it('仅 animation 和 template 目录的右键菜单会显示创建文件入口', async () => {
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
    createFileMock.mockResolvedValue('/project/game/animation/新建文件.json')
    getFolderContentsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'application/json',
          modifiedAt: 2,
          name: '新建文件.json',
          path: '/project/game/animation/新建文件.json',
          size: 0,
        },
      ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
    }))
    setPreviewUnavailable()

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

    expect(createFileMock).toHaveBeenCalledWith('/project/game/animation', 'edit.fileTree.defaultFileStem.json')

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    })
    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()

    await expect.element(page.getByRole('textbox')).toHaveValue('新建文件.json')
  })

  it('template 空白区右键菜单新建文件时会使用 .scss 默认后缀', async () => {
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

    expect(createFileMock).toHaveBeenCalledWith('/games/demo/game/template', 'edit.fileTree.defaultFileStem.scss')
  })

  it('空白区右键菜单新建文件夹后会创建目录并打开重命名 Popover', async () => {
    vi.useFakeTimers()
    getFolderContentsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: true,
          modifiedAt: 2,
          name: '新建文件夹',
          path: '/project/game/background/新建文件夹',
          size: 0,
        },
      ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
    }))
    setPreviewUnavailable()

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

    expect(createFolderMock).toHaveBeenCalledWith('/project/game/background', 'edit.fileTree.defaultFolderName')

    await vi.waitFor(() => {
      expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    })
    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()

    await expect.element(page.getByRole('textbox')).toHaveValue('新建文件夹')
  })

  it('创建文件夹后如果已切换目录，则不会继续打开旧目录的重命名 Popover', async () => {
    vi.useFakeTimers()
    createFolderMock.mockResolvedValue('/project/game/background/新建文件夹')
    getFolderContentsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
    }))
    setPreviewUnavailable()

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
      expect(createFolderMock).toHaveBeenCalledWith('/project/game/background', 'edit.fileTree.defaultFolderName')
      expect(getFolderContentsMock).toHaveBeenCalledTimes(2)
    })

    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()

    await expect.element(page.getByRole('textbox')).not.toBeInTheDocument()
  })

  it('搜索结果中隐藏新建目录时仍会打开重命名 Popover', async () => {
    vi.useFakeTimers()
    getFolderContentsMock
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 2,
          name: 'hero.png',
          path: '/project/game/background/hero.png',
          size: 1024,
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: true,
          modifiedAt: 2,
          name: '新建文件夹',
          path: '/project/game/background/新建文件夹',
          size: 0,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 2,
          name: 'hero.png',
          path: '/project/game/background/hero.png',
          size: 1024,
        },
      ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
    }))
    setPreviewUnavailable()

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
    getFolderContentsMock
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 2,
          name: 'hero-1.png',
          path: '/project/game/background/hero-1.png',
          size: 1024,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 3,
          name: 'hero-2.png',
          path: '/project/game/background/hero-2.png',
          size: 1024,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 4,
          name: 'hero-3.png',
          path: '/project/game/background/hero-3.png',
          size: 1024,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 5,
          name: 'hero-4.png',
          path: '/project/game/background/hero-4.png',
          size: 1024,
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: 1,
          isDir: true,
          modifiedAt: 2,
          name: '新建文件夹',
          path: '/project/game/background/新建文件夹',
          size: 0,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 2,
          name: 'hero-1.png',
          path: '/project/game/background/hero-1.png',
          size: 1024,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 3,
          name: 'hero-2.png',
          path: '/project/game/background/hero-2.png',
          size: 1024,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 4,
          name: 'hero-3.png',
          path: '/project/game/background/hero-3.png',
          size: 1024,
        },
        {
          createdAt: 1,
          isDir: false,
          mimeType: 'image/png',
          modifiedAt: 5,
          name: 'hero-4.png',
          path: '/project/game/background/hero-4.png',
          size: 1024,
        },
      ])
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/project',
      },
    }))
    setPreviewUnavailable()

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
    getFolderContentsMock.mockResolvedValue([
      {
        createdAt: 1,
        isDir: true,
        modifiedAt: 2,
        name: 'edit.fileTree.defaultFolderName',
        path: '/games/demo/game/background/edit.fileTree.defaultFolderName',
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

    expect(createFolderMock).toHaveBeenCalledWith('/games/demo/game/background', 'edit.fileTree.defaultFolderName 2')
  })
})
