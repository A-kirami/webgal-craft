import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, nextTick, onMounted, ref } from 'vue'

import { createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import { useFileViewerLayout } from '~/components/file-viewer/useFileViewerLayout'
import { useFileViewerVirtualizer } from '~/components/file-viewer/useFileViewerVirtualizer'

import FileViewer from './FileViewer.vue'
import FileViewerImageHoverCard from './FileViewerImageHoverCard.vue'

import type { FileViewerItem, FileViewerPreviewSize } from '~/types/file-viewer'

const {
  getImageDimensionsMock,
  loggerDebugMock,
  loggerErrorMock,
  resolveAssetUrlMock,
  measureMock,
  resolvePreviewUrlMock,
  scrollToIndexMock,
  viewportWidthMock,
} = vi.hoisted(() => ({
  getImageDimensionsMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  resolveAssetUrlMock: vi.fn(),
  measureMock: vi.fn(),
  resolvePreviewUrlMock: vi.fn(),
  scrollToIndexMock: vi.fn(),
  viewportWidthMock: { value: 780 },
}))

vi.mock('@tanstack/vue-virtual', () => ({
  useVirtualizer: (optionsRef: { value: { count: number, estimateSize: () => number } }) => ({
    get value() {
      const options = optionsRef.value
      const rowSize = options.estimateSize()

      return {
        getTotalSize: () => options.count * rowSize,
        getVirtualItems: () =>
          Array.from({ length: options.count }, (_, index) => ({
            index,
            key: index,
            size: rowSize,
            start: index * rowSize,
          })),
        measure: measureMock,
        scrollToIndex: scrollToIndexMock,
      }
    },
  }),
}))

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')
  return {
    ...actual,
    useElementSize: () => ({
      width: viewportWidthMock,
    }),
  }
})

vi.mock('~/commands/fs', () => ({
  fsCmds: {
    getImageDimensions: getImageDimensionsMock,
  },
}))

vi.mock('~/services/platform/asset-url', () => ({
  resolveAssetUrl: resolveAssetUrlMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  debug: loggerDebugMock,
  error: loggerErrorMock,
}))

vi.mock('~/components/ui/hover-card', async () => {
  const { defineComponent, h, inject, provide, ref, watch } = await vi.importActual<typeof import('vue')>('vue')

  const hoverCardContextKey = Symbol('file-viewer-hover-card')

  const HoverCard = defineComponent({
    name: 'StubHoverCard',
    props: {
      open: {
        type: Boolean,
        default: undefined,
      },
      closeDelay: {
        type: Number,
        default: undefined,
      },
      openDelay: {
        type: Number,
        default: undefined,
      },
    },
    emits: ['update:open'],
    setup(_props, { emit, slots }) {
      const isOpen = ref(false)
      const isRendered = ref(false)
      let openTimer: ReturnType<typeof setTimeout> | undefined
      let closeTimer: ReturnType<typeof setTimeout> | undefined

      function syncControlledOpen(nextOpen: boolean) {
        if (openTimer) {
          clearTimeout(openTimer)
          openTimer = undefined
        }

        if (closeTimer) {
          clearTimeout(closeTimer)
          closeTimer = undefined
        }

        if (nextOpen) {
          isOpen.value = true
          isRendered.value = true
          return
        }

        isOpen.value = false
        if ((_props.closeDelay ?? 0) <= 0) {
          isRendered.value = false
          return
        }

        closeTimer = setTimeout(() => {
          isRendered.value = false
          closeTimer = undefined
        }, _props.closeDelay ?? 0)
      }

      watch(() => _props.open, (nextOpen) => {
        if (nextOpen === undefined) {
          return
        }

        syncControlledOpen(nextOpen)
      }, { immediate: true })

      function setOpen(nextOpen: boolean) {
        if (openTimer) {
          clearTimeout(openTimer)
          openTimer = undefined
        }

        if (closeTimer) {
          clearTimeout(closeTimer)
          closeTimer = undefined
        }

        if (nextOpen) {
          openTimer = setTimeout(() => {
            emit('update:open', true)
            if (_props.open === undefined) {
              isOpen.value = true
              isRendered.value = true
            }
            openTimer = undefined
          }, _props.openDelay ?? 0)
          return
        }

        emit('update:open', false)
        if (_props.open === undefined) {
          isOpen.value = false
        }

        if ((_props.closeDelay ?? 0) <= 0) {
          if (_props.open === undefined) {
            isRendered.value = false
          }
          return
        }

        closeTimer = setTimeout(() => {
          if (_props.open === undefined) {
            isRendered.value = false
          }
          closeTimer = undefined
        }, _props.closeDelay ?? 0)
      }

      provide(hoverCardContextKey, {
        isOpen,
        isRendered,
        setOpen,
      })

      return () => h('div', { 'data-testid': 'hover-card-root' }, slots.default?.())
    },
  })

  const HoverCardTrigger = defineComponent({
    name: 'StubHoverCardTrigger',
    setup(_, { slots }) {
      const context = inject<{ isOpen: { value: boolean }, setOpen: (value: boolean) => void }>(hoverCardContextKey)

      return () => h('div', {
        'data-testid': 'hover-card-trigger',
        'onBlur': () => context?.setOpen(false),
        'onFocus': () => context?.setOpen(true),
        'onPointerenter': () => context?.setOpen(true),
        'onPointerleave': () => context?.setOpen(false),
      }, slots.default?.())
    },
  })

  const HoverCardContent = defineComponent({
    name: 'StubHoverCardContent',
    props: {
      side: {
        type: String,
        default: undefined,
      },
    },
    setup(props, { attrs, slots }) {
      const context = inject<{ isOpen: { value: boolean }, isRendered: { value: boolean } }>(hoverCardContextKey)

      return () => context?.isRendered.value
        ? h('div', {
            ...attrs,
            'data-state': context.isOpen.value ? 'open' : 'closed',
            'data-side': props.side,
            'data-testid': 'hover-card-content',
          }, slots.default?.())
        : undefined
    },
  })

  return {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
  }
})

const BASE_TIMESTAMP = Date.parse('2023-11-14T00:00:00Z')
const HOVER_PREVIEW_WARMUP_DELAY_MS = 120
const HOVER_CARD_OPEN_DELAY_MS = 350
const IMAGE_DATA_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
const FILE_VIEWER_PREVIEW_PROPS = Object.freeze({
  previewBaseUrl: 'http://127.0.0.1:8899/game/demo/',
  previewCwd: '/games/demo',
})

function createItem(index: number): FileViewerItem {
  return {
    name: `file-${index}.txt`,
    path: `/assets/file-${index}.txt`,
    isDir: false,
    size: 1024 + index,
    modifiedAt: BASE_TIMESTAMP + index,
    createdAt: BASE_TIMESTAMP + index,
  }
}

function createImageItem(index: number): FileViewerItem {
  return {
    ...createItem(index),
    mimeType: 'image/png',
  }
}

function createSvgItem(index: number): FileViewerItem {
  return {
    ...createItem(index),
    name: `file-${index}.svg`,
    path: `/assets/file-${index}.svg`,
    mimeType: 'image/svg+xml',
  }
}

function createSizedPreviewUrl(item: FileViewerItem, previewSize: FileViewerPreviewSize): string {
  const previewPath = item.path.replace(/\.[^./\\]+$/, '.png')
  const url = new URL(`http://127.0.0.1:8899/game/demo${previewPath}`)
  url.searchParams.set('t', String(item.modifiedAt ?? 0))
  url.searchParams.set('w', String(previewSize.width))
  url.searchParams.set('h', String(previewSize.height))
  return url.href
}

function createBuiltInPreviewUrl(
  assetPath: string,
  options: {
    cacheVersion?: number
    thumbnail?: {
      width?: number
      height?: number
    }
  } = {},
): string {
  return createSizedPreviewUrl({
    createdAt: options.cacheVersion,
    isDir: false,
    mimeType: assetPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
    modifiedAt: options.cacheVersion,
    name: assetPath.split('/').at(-1) ?? assetPath,
    path: assetPath,
    size: 0,
  }, {
    width: options.thumbnail?.width ?? 0,
    height: options.thumbnail?.height ?? 0,
  })
}

function expectBuiltInPreviewRequest(item: FileViewerItem, previewSize: FileViewerPreviewSize): void {
  expect(resolveAssetUrlMock).toHaveBeenCalledWith(item.path, {
    cwd: FILE_VIEWER_PREVIEW_PROPS.previewCwd,
    cacheVersion: item.modifiedAt,
    previewBaseUrl: FILE_VIEWER_PREVIEW_PROPS.previewBaseUrl,
    thumbnail: {
      width: previewSize.width,
      height: previewSize.height,
      resizeMode: 'contain',
    },
  })
}

function mockBuiltInPreviewResolution(): void {
  resolveAssetUrlMock.mockImplementation((assetPath: string, options: {
    cacheVersion?: number
    thumbnail?: {
      width?: number
      height?: number
    }
  }) => createBuiltInPreviewUrl(assetPath, options))
}

const globalStubs = {
  ContextMenu: defineComponent({
    name: 'StubContextMenu',
    setup(_, { attrs, slots }) {
      return () => h('div', {
        ...attrs,
        'data-testid': 'context-menu-root',
      }, slots.default?.())
    },
  }),
  ContextMenuContent: createBrowserContainerStub('StubContextMenuContent'),
  ContextMenuTrigger: createBrowserContainerStub('StubContextMenuTrigger'),
  ScrollArea: defineComponent({
    name: 'StubScrollArea',
    setup(_, { attrs, expose, slots }) {
      const viewportElement = document.createElement('div')
      expose({
        viewport: {
          viewportElement,
        },
      })

      return () => h('div', attrs, slots.default?.())
    },
  }),
}

function createImageFallbackHarness(viewMode: 'grid' | 'list') {
  return defineComponent({
    name: 'FileViewerImageFallbackHarness',
    setup() {
      return () => h(FileViewer, {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [createImageItem(1)],
        viewMode,
      }, {
        icon: ({ item }: { item: FileViewerItem, iconSize: number }) =>
          h('span', { 'data-testid': `${viewMode}-icon-fallback` }, `${item.name}-fallback`),
      })
    },
  })
}

function getHoverImageTriggerElements(index: number = 0): { trigger: HTMLElement | undefined, warmupTarget: HTMLElement | undefined } {
  const trigger = document.querySelectorAll<HTMLElement>('[data-testid="hover-card-trigger"]')[index]
  const warmupTarget = trigger?.firstElementChild instanceof HTMLElement
    ? trigger.firstElementChild
    : trigger

  return {
    trigger,
    warmupTarget,
  }
}

async function hoverImageTrigger(index: number = 0): Promise<HTMLElement | undefined> {
  const { trigger, warmupTarget } = getHoverImageTriggerElements(index)
  warmupTarget?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
  trigger?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
  await nextTick()
  return trigger
}

async function openHoverImageTrigger(index: number = 0): Promise<HTMLElement | undefined> {
  const trigger = await hoverImageTrigger(index)
  await vi.advanceTimersByTimeAsync(HOVER_CARD_OPEN_DELAY_MS)
  await nextTick()
  await nextTick()
  return trigger
}

async function leaveHoverImageTrigger(index: number = 0): Promise<void> {
  const { trigger, warmupTarget } = getHoverImageTriggerElements(index)
  warmupTarget?.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))
  trigger?.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))
  await nextTick()
  await nextTick()
}

describe('FileViewer 组合式逻辑', () => {
  it('useFileViewerLayout 会根据宽度和缩放返回布局派生状态', async () => {
    const contentWidth = ref(780)
    const zoom = ref(100)

    const layout = useFileViewerLayout({
      contentWidth,
      gridItemMinWidth: 80,
      zoom,
    })

    expect(layout.normalizedZoom.value).toBe(100)
    expect(layout.gridCols.value).toBe(9)
    expect(layout.showListSize.value).toBe(true)
    expect(layout.showListModifiedAt.value).toBe(true)
    expect(layout.showListCreatedAt.value).toBe(true)

    contentWidth.value = 700
    await nextTick()
    expect(layout.showListSize.value).toBe(true)
    expect(layout.showListModifiedAt.value).toBe(true)
    expect(layout.showListCreatedAt.value).toBe(false)

    contentWidth.value = 520
    await nextTick()
    expect(layout.showListSize.value).toBe(false)
    expect(layout.showListModifiedAt.value).toBe(false)

    zoom.value = 200
    await nextTick()
    expect(layout.normalizedZoom.value).toBe(150)
    expect(layout.gridItemWidth.value).toBe(120)
  })

  it('useFileViewerVirtualizer 在 grid/list 模式下会映射正确滚动目标', async () => {
    const sortedItems = ref([
      createItem(1),
      createItem(2),
      createItem(3),
      createItem(4),
      createItem(5),
    ])
    const viewMode = ref<'grid' | 'list'>('grid')
    const viewportElement = ref<HTMLElement>()

    const virtualizer = useFileViewerVirtualizer({
      gridCols: ref(2),
      gridItemHeight: ref(96),
      listItemHeight: ref(40),
      sortedItems,
      viewMode,
      viewportElement,
    })

    expect(virtualizer.rowCount.value).toBe(3)
    expect(virtualizer.getGridRowItems(1).map(item => item.path)).toEqual([
      '/assets/file-3.txt',
      '/assets/file-4.txt',
    ])

    virtualizer.scrollToIndex(4)
    expect(scrollToIndexMock).toHaveBeenLastCalledWith(2)

    viewMode.value = 'list'
    await nextTick()

    virtualizer.scrollToIndex(4)
    expect(scrollToIndexMock).toHaveBeenLastCalledWith(4)
    // List access clamps to the last item when callers ask for an out-of-bounds index.
    expect(virtualizer.getListItem(99).path).toBe('/assets/file-5.txt')
  })
})

describe('FileViewer 外观契约', () => {
  beforeEach(() => {
    getImageDimensionsMock.mockReset()
    loggerDebugMock.mockReset()
    loggerErrorMock.mockReset()
    resolveAssetUrlMock.mockReset()
    resolvePreviewUrlMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('默认不会为图片项私自生成预览 URL', async () => {
    viewportWidthMock.value = 780

    renderInBrowser(FileViewer, {
      props: {
        items: [createImageItem(1)],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(resolveAssetUrlMock).not.toHaveBeenCalled()
    await expect.element(page.getByAltText('file-1.txt')).not.toBeInTheDocument()
  })

  it('提供预览上下文后会在 FileViewer 内部生成缩略图地址', async () => {
    const item = createImageItem(1)
    viewportWidthMock.value = 780
    resolveAssetUrlMock.mockReturnValue('http://127.0.0.1:8899/game/demo/assets/file-1.png?t=1700000000001&w=64&h=64&fit=contain')

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    expectBuiltInPreviewRequest(item, {
      width: 64,
      height: 64,
    })
    await expect.element(page.getByAltText(item.name)).toHaveAttribute('src', 'http://127.0.0.1:8899/game/demo/assets/file-1.png?t=1700000000001&w=64&h=64&fit=contain')
  })

  it('受控打开态在挂载时会立即初始化 hover 预览', async () => {
    const item = createImageItem(24)
    getImageDimensionsMock.mockResolvedValue([640, 360])
    resolvePreviewUrlMock.mockImplementation((resolvedItem: FileViewerItem, preview: FileViewerPreviewSize) =>
      createSizedPreviewUrl(resolvedItem, preview),
    )

    renderInBrowser(FileViewerImageHoverCard, {
      props: {
        item,
        open: true,
        resolvePreviewUrl: (resolvedItem: FileViewerItem, preview: FileViewerPreviewSize) =>
          resolvePreviewUrlMock(resolvedItem, preview),
      },
      slots: {
        default: () => h('span', 'trigger'),
      },
    })

    await vi.waitFor(() => {
      expect(resolvePreviewUrlMock).toHaveBeenCalledWith(expect.objectContaining({
        path: item.path,
      }), {
        width: 256,
        height: 256,
      })
      expect(getImageDimensionsMock).toHaveBeenCalledWith(item.path)
    })

    await expect.element(page.getByAltText(item.name)).toBeInTheDocument()
  })

  it('hover 预览打开时切换图片资源会立即重建预览状态', async () => {
    const initialItem = createImageItem(25)
    const nextModifiedAt = (initialItem.modifiedAt ?? 0) + 1000

    getImageDimensionsMock.mockResolvedValue([800, 450])
    resolvePreviewUrlMock.mockImplementation((resolvedItem: FileViewerItem, preview: FileViewerPreviewSize) =>
      createSizedPreviewUrl(resolvedItem, preview),
    )

    const FileViewerImageHoverCardHarness = defineComponent({
      name: 'FileViewerImageHoverCardHarness',
      setup() {
        const item = ref(initialItem)

        function handleChangeItem() {
          item.value = {
            ...item.value,
            modifiedAt: nextModifiedAt,
          }
        }

        return () => h('div', [
          h(FileViewerImageHoverCard, {
            item: item.value,
            open: true,
            resolvePreviewUrl: (resolvedItem: FileViewerItem, preview: FileViewerPreviewSize) =>
              resolvePreviewUrlMock(resolvedItem, preview),
          }, {
            default: () => h('span', 'trigger'),
          }),
          h('button', {
            'type': 'button',
            'data-testid': 'change-hover-preview-item',
            'onClick': handleChangeItem,
          }, 'change'),
        ])
      },
    })

    renderInBrowser(FileViewerImageHoverCardHarness)

    await vi.waitFor(() => {
      expect(resolvePreviewUrlMock).toHaveBeenCalled()
      expect(getImageDimensionsMock).toHaveBeenCalledWith(initialItem.path)
    })
    await expect.element(page.getByAltText(initialItem.name)).toBeInTheDocument()

    resolvePreviewUrlMock.mockClear()
    getImageDimensionsMock.mockClear()

    await page.getByTestId('change-hover-preview-item').click()

    await vi.waitFor(() => {
      expect(resolvePreviewUrlMock).toHaveBeenCalledWith(expect.objectContaining({
        modifiedAt: nextModifiedAt,
        path: initialItem.path,
      }), {
        width: 256,
        height: 256,
      })
      expect(getImageDimensionsMock).toHaveBeenCalledWith(initialItem.path)
    })

    await expect.element(page.getByAltText(initialItem.name)).toBeInTheDocument()
  })

  it('网格模式图片项会使用内建缩略图地址', async () => {
    const item = createImageItem(1)
    viewportWidthMock.value = 780
    mockBuiltInPreviewResolution()

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    expectBuiltInPreviewRequest(item, {
      height: 64,
      width: 64,
    })
    await expect.element(page.getByAltText(item.name)).toHaveAttribute('src', createSizedPreviewUrl(item, {
      width: 64,
      height: 64,
    }))
  })

  it('列表模式图片项也会使用内建缩略图地址', async () => {
    const item = createImageItem(1)
    viewportWidthMock.value = 780
    mockBuiltInPreviewResolution()

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'list',
      },
      global: {
        stubs: globalStubs,
      },
    })

    expectBuiltInPreviewRequest(item, {
      height: 20,
      width: 20,
    })
    await expect.element(page.getByAltText(item.name)).toHaveAttribute('src', createSizedPreviewUrl(item, {
      width: 20,
      height: 20,
    }))
  })

  it('网格模式图片加载失败后会回退到图标槽位', async () => {
    viewportWidthMock.value = 780
    mockBuiltInPreviewResolution()

    renderInBrowser(createImageFallbackHarness('grid'), {
      global: {
        stubs: globalStubs,
      },
    })

    const image = await page.getByAltText('file-1.txt').element()
    image.dispatchEvent(new Event('error'))
    await nextTick()

    await expect.element(page.getByAltText('file-1.txt')).not.toBeInTheDocument()
    await expect.element(page.getByTestId('grid-icon-fallback')).toHaveTextContent('file-1.txt-fallback')
  })

  it('列表模式图片加载失败后也会回退到图标槽位', async () => {
    viewportWidthMock.value = 780
    mockBuiltInPreviewResolution()

    renderInBrowser(createImageFallbackHarness('list'), {
      global: {
        stubs: globalStubs,
      },
    })

    const image = await page.getByAltText('file-1.txt').element()
    image.dispatchEvent(new Event('error'))
    await nextTick()

    await expect.element(page.getByAltText('file-1.txt')).not.toBeInTheDocument()
    await expect.element(page.getByTestId('list-icon-fallback')).toHaveTextContent('file-1.txt-fallback')
  })

  it('图片预览失败一段时间后会自动再次尝试同一个 URL', async () => {
    const item = createImageItem(18)
    const queryImage = () => document.querySelector<HTMLImageElement>(`img[alt="${item.name}"]`)

    vi.useFakeTimers()
    viewportWidthMock.value = 780
    mockBuiltInPreviewResolution()

    const result = await renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(queryImage()?.getAttribute('src')).toBe(createSizedPreviewUrl(item, {
      width: 64,
      height: 64,
    }))

    queryImage()?.dispatchEvent(new Event('error'))
    await nextTick()

    expect(queryImage()).toBeNull()

    await vi.advanceTimersByTimeAsync(5000)
    await nextTick()

    expect(queryImage()?.getAttribute('src')).toBe(createSizedPreviewUrl(item, {
      width: 64,
      height: 64,
    }))
    await result.unmount()
  })

  it('网格模式图片项 hover 后会请求大图预览并显示原图分辨率', async () => {
    const item = createImageItem(11)
    const hoverPreviewSize = {
      width: 256,
      height: 256,
    }

    vi.useFakeTimers()
    viewportWidthMock.value = 780
    getImageDimensionsMock.mockResolvedValue([1920, 1080])
    mockBuiltInPreviewResolution()

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await openHoverImageTrigger()

    expectBuiltInPreviewRequest(item, hoverPreviewSize)
    expect(getImageDimensionsMock).toHaveBeenCalledWith(item.path)
    await expect.element(page.getByTestId('hover-card-content')).toHaveAttribute('data-side', 'top')
    await expect.element(page.getByText('1920 × 1080')).toBeVisible()
  })

  it('hover 预览不会再使用固定尺寸外框', async () => {
    const item = createImageItem(12)

    vi.useFakeTimers()
    viewportWidthMock.value = 780
    getImageDimensionsMock.mockResolvedValue([320, 180])
    mockBuiltInPreviewResolution()

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await openHoverImageTrigger()

    const hoverContent = await page.getByTestId('hover-card-content').element()
    const previewFrame = hoverContent.querySelector('div')
    const previewImage = hoverContent.querySelector('img')

    expect(hoverContent.className).not.toContain('w-72')
    expect(previewFrame?.className ?? '').not.toContain('h-64')
    expect(previewFrame?.className ?? '').not.toContain('w-64')
    expect(previewImage?.className ?? '').not.toContain('h-full')
    expect(previewImage?.className ?? '').not.toContain('w-full')
  })

  it('hover 图片尚未完成显示时会预留最终媒体区域，避免卡片尺寸跳变', async () => {
    const item = createImageItem(13)

    vi.useFakeTimers()
    viewportWidthMock.value = 780
    getImageDimensionsMock.mockResolvedValue([1600, 900])
    resolveAssetUrlMock.mockReturnValue(IMAGE_DATA_URL)

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await openHoverImageTrigger()

    const mediaFrame = document.querySelector<HTMLElement>('[data-testid="hover-card-media-frame"]')
    expect(mediaFrame).not.toBeNull()
    expect(mediaFrame?.style.width).toBe('256px')
    expect(mediaFrame?.style.height).toBe('144px')
  })

  it('hover 图片预览会复用现有棋盘格背景', async () => {
    const item = createImageItem(19)

    vi.useFakeTimers()
    viewportWidthMock.value = 780
    getImageDimensionsMock.mockResolvedValue([1024, 1024])
    resolveAssetUrlMock.mockReturnValue(IMAGE_DATA_URL)

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await openHoverImageTrigger()

    await expect.element(page.getByTestId('hover-card-media-frame')).toBeInTheDocument()
    const mediaFrame = await page.getByTestId('hover-card-media-frame').element()
    mediaFrame.querySelector('img')?.dispatchEvent(new Event('load'))
    await nextTick()

    expect(mediaFrame.className).toContain('bg-checkerboard')
    expect(mediaFrame.className).not.toContain('bg-muted/40')
  })

  it('hover 图片加载完成前不会提前显示棋盘格背景', async () => {
    const item = createImageItem(20)
    const srcSetterSpy = vi.spyOn(HTMLImageElement.prototype, 'src', 'set')
      .mockImplementation(function mockSrcSetter(this: HTMLImageElement, value: string) {
        this.dataset.mockSrc = value
      })

    try {
      vi.useFakeTimers()
      viewportWidthMock.value = 780
      getImageDimensionsMock.mockResolvedValue([1024, 1024])
      resolveAssetUrlMock.mockReturnValue(IMAGE_DATA_URL)

      renderInBrowser(FileViewer, {
        props: {
          ...FILE_VIEWER_PREVIEW_PROPS,
          items: [item],
          viewMode: 'grid',
        },
        global: {
          stubs: globalStubs,
        },
      })

      await openHoverImageTrigger()
      await expect.element(page.getByTestId('hover-card-content')).toBeInTheDocument()

      await expect.element(page.getByTestId('hover-card-media-frame')).toBeInTheDocument()
      const mediaFrame = await page.getByTestId('hover-card-media-frame').element()
      const previewImage = mediaFrame.querySelector('img')

      expect(mediaFrame.className).not.toContain('bg-checkerboard')

      previewImage?.dispatchEvent(new Event('load'))
      await nextTick()

      expect(mediaFrame.className).toContain('bg-checkerboard')
    } finally {
      srcSetterSpy.mockRestore()
    }
  })

  it('列表模式图片项 hover 预览会显示在右侧', async () => {
    const item = createImageItem(14)

    vi.useFakeTimers()
    viewportWidthMock.value = 780
    getImageDimensionsMock.mockResolvedValue([1280, 720])
    mockBuiltInPreviewResolution()

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'list',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await openHoverImageTrigger()

    await expect.element(page.getByTestId('hover-card-content')).toHaveAttribute('data-side', 'right')
    await expect.element(page.getByText('1280 × 720')).toBeVisible()
  })

  it('hover 预览会在图片下方显示文件名和分辨率', async () => {
    const item = createImageItem(15)

    vi.useFakeTimers()
    viewportWidthMock.value = 780
    getImageDimensionsMock.mockResolvedValue([1280, 720])
    mockBuiltInPreviewResolution()

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'list',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await openHoverImageTrigger()
    await expect.element(page.getByText('1280 × 720')).toBeVisible()

    const hoverContent = await page.getByTestId('hover-card-content').element()
    const textContent = hoverContent.textContent ?? ''

    expect(textContent).toContain(item.name)
    expect(textContent).toContain('1280 × 720')
    expect(textContent.indexOf(item.name)).toBeLessThan(textContent.indexOf('1280 × 720'))
  })

  it('hovercard 进入关闭态时会保留当前图片，不会先切到 fallback', async () => {
    const item = createImageItem(16)

    vi.useFakeTimers()
    viewportWidthMock.value = 780
    getImageDimensionsMock.mockResolvedValue([1280, 720])
    resolveAssetUrlMock.mockReturnValue(IMAGE_DATA_URL)

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await openHoverImageTrigger()

    const openHoverContent = await page.getByTestId('hover-card-content').element()
    const openMediaFrame = await page.getByTestId('hover-card-media-frame').element()
    openMediaFrame.querySelector('img')?.dispatchEvent(new Event('load'))
    await nextTick()

    expect(openHoverContent.dataset.state).toBe('open')
    expect(openHoverContent.querySelector('img')?.getAttribute('alt')).toBe(item.name)

    await leaveHoverImageTrigger()

    const closingHoverContent = await page.getByTestId('hover-card-content').element()
    expect(closingHoverContent.dataset.state).toBe('closed')
    expect(closingHoverContent.querySelector('img')?.getAttribute('alt')).toBe(item.name)
  })

  it('hover 预览加载失败后再次打开会重新尝试加载预览', async () => {
    const item = createImageItem(21)

    vi.useFakeTimers()
    viewportWidthMock.value = 780
    getImageDimensionsMock.mockResolvedValue([1280, 720])
    resolveAssetUrlMock.mockReturnValue(IMAGE_DATA_URL)

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await openHoverImageTrigger()

    const openHoverContent = await page.getByTestId('hover-card-content').element()
    openHoverContent.querySelector('img')?.dispatchEvent(new Event('error'))
    await nextTick()

    const erroredHoverContent = await page.getByTestId('hover-card-content').element()
    expect(erroredHoverContent.querySelector('[data-testid="hover-card-media-frame"]')).toBeNull()

    await leaveHoverImageTrigger()
    await vi.advanceTimersByTimeAsync(121)
    await nextTick()

    await openHoverImageTrigger()

    const reopenedHoverContent = await page.getByTestId('hover-card-content').element()
    expect(reopenedHoverContent.querySelector('[data-testid="hover-card-media-frame"]')).not.toBeNull()
  })

  it('多个缩略图依次触发 hover 时只会保留一个预览 card 打开', async () => {
    vi.useFakeTimers()
    viewportWidthMock.value = 780
    getImageDimensionsMock.mockResolvedValue([1280, 720])
    mockBuiltInPreviewResolution()

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [
          createImageItem(22),
          createImageItem(23),
        ],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await openHoverImageTrigger(0)
    await openHoverImageTrigger(1)

    expect(document.querySelectorAll('[data-testid="hover-card-content"]')).toHaveLength(1)
  })

  it('悬停意图成立后会在打开前预热 hover 大图 URL', async () => {
    const item = createImageItem(17)
    const preloadedImageUrls: string[] = []

    class FakeImage {
      decoding = ''
      #src = ''
      #listeners = {
        error: new Set<() => void>(),
        load: new Set<() => void>(),
      }

      addEventListener(type: string, listener: () => void) {
        if (type === 'load') {
          this.#listeners.load.add(listener)
        } else if (type === 'error') {
          this.#listeners.error.add(listener)
        }
      }

      get src() {
        return this.#src
      }

      set src(value: string) {
        this.#src = value
        preloadedImageUrls.push(value)
        setTimeout(() => {
          for (const listener of this.#listeners.load) {
            listener()
          }
        }, 0)
      }
    }

    vi.useFakeTimers()
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)

    viewportWidthMock.value = 780
    getImageDimensionsMock.mockResolvedValue([1280, 720])
    mockBuiltInPreviewResolution()

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(preloadedImageUrls).toHaveLength(0)
    await hoverImageTrigger()

    await vi.advanceTimersByTimeAsync(HOVER_PREVIEW_WARMUP_DELAY_MS - 1)
    expect(preloadedImageUrls).toHaveLength(0)
    await expect.element(page.getByTestId('hover-card-content')).not.toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(1)
    expect(preloadedImageUrls).toEqual([createSizedPreviewUrl(item, { width: 256, height: 256 })])
    expectBuiltInPreviewRequest(item, {
      width: 256,
      height: 256,
    })
    expect(getImageDimensionsMock).toHaveBeenCalledWith(item.path)
    await expect.element(page.getByTestId('hover-card-content')).not.toBeInTheDocument()
  })

  it('快速移开图片时不会预热 hover 大图 URL', async () => {
    const item = createImageItem(1)
    const preloadedImageUrls: string[] = []

    class FakeImage {
      decoding = ''
      #src = ''
      #listeners = {
        error: new Set<() => void>(),
        load: new Set<() => void>(),
      }

      addEventListener(type: string, listener: () => void) {
        if (type === 'load') {
          this.#listeners.load.add(listener)
        } else if (type === 'error') {
          this.#listeners.error.add(listener)
        }
      }

      get src() {
        return this.#src
      }

      set src(value: string) {
        this.#src = value
        preloadedImageUrls.push(value)
        setTimeout(() => {
          for (const listener of this.#listeners.load) {
            listener()
          }
        }, 0)
      }
    }

    vi.useFakeTimers()
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)

    viewportWidthMock.value = 780
    mockBuiltInPreviewResolution()

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await hoverImageTrigger()
    await leaveHoverImageTrigger()

    await vi.advanceTimersByTimeAsync(HOVER_PREVIEW_WARMUP_DELAY_MS)
    expect(preloadedImageUrls).toHaveLength(0)
  })

  it('非图片项不会渲染 hover 预览触发器', async () => {
    viewportWidthMock.value = 780

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [createItem(1)],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(document.querySelectorAll('[data-testid="hover-card-trigger"]')).toHaveLength(0)
    expect(getImageDimensionsMock).not.toHaveBeenCalled()
  })

  it('SVG hover 预览不会调用位图尺寸读取命令', async () => {
    const item = createSvgItem(31)

    vi.useFakeTimers()
    viewportWidthMock.value = 780
    resolveAssetUrlMock.mockReturnValue(IMAGE_DATA_URL)

    renderInBrowser(FileViewer, {
      props: {
        ...FILE_VIEWER_PREVIEW_PROPS,
        items: [item],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await openHoverImageTrigger()
    await expect.element(page.getByTestId('hover-card-content')).toBeInTheDocument()
    await expect.element(page.getByTestId('hover-card-media-frame')).toBeInTheDocument()
    expect(getImageDimensionsMock).not.toHaveBeenCalled()
  })

  it('未提供 #context-menu slot 时不会渲染 ContextMenu 包裹', async () => {
    viewportWidthMock.value = 780

    renderInBrowser(FileViewer, {
      props: {
        items: [createItem(1), createItem(2)],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(document.querySelectorAll('[data-testid="context-menu-root"]')).toHaveLength(0)
  })

  it('未提供 #background-context-menu slot 时不会渲染空白区右键触发层', async () => {
    viewportWidthMock.value = 780

    renderInBrowser(FileViewer, {
      props: {
        items: [createItem(1), createItem(2)],
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(document.querySelector('[data-file-viewer-background-surface="true"]')).toBeNull()
  })

  it('提供 #context-menu slot 时会向每个条目透传当前 item', async () => {
    viewportWidthMock.value = 780

    renderInBrowser(FileViewer, {
      props: {
        items: [createItem(1), createItem(2)],
        viewMode: 'grid',
      },
      slots: {
        'context-menu': ({ item }: { item: FileViewerItem }) =>
          h('div', { 'data-testid': `context-menu-item-${item.name}` }, item.path),
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(document.querySelectorAll('[data-testid="context-menu-root"]')).toHaveLength(2)
    await expect.element(page.getByTestId('context-menu-item-file-1.txt')).toHaveTextContent('/assets/file-1.txt')
    await expect.element(page.getByTestId('context-menu-item-file-2.txt')).toHaveTextContent('/assets/file-2.txt')
  })

  it('提供 #background-context-menu slot 时会为文件视图空白区单独渲染菜单', async () => {
    viewportWidthMock.value = 780

    renderInBrowser(FileViewer, {
      props: {
        items: [createItem(1), createItem(2)],
        viewMode: 'grid',
      },
      slots: {
        'background-context-menu': () =>
          h('div', { 'data-testid': 'background-context-menu-content' }, 'background'),
        'context-menu': ({ item }: { item: FileViewerItem }) =>
          h('div', { 'data-testid': `context-menu-item-${item.name}` }, item.path),
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(document.querySelector('[data-file-viewer-background-surface="true"]')).not.toBeNull()
    expect(document.querySelectorAll('[data-testid="context-menu-root"]')).toHaveLength(3)
    await expect.element(page.getByTestId('background-context-menu-content')).toHaveTextContent('background')
    await expect.element(page.getByTestId('context-menu-item-file-1.txt')).toHaveTextContent('/assets/file-1.txt')
    await expect.element(page.getByTestId('context-menu-item-file-2.txt')).toHaveTextContent('/assets/file-2.txt')
  })

  it('空目录时提供 #background-context-menu slot 仍会渲染背景菜单', async () => {
    viewportWidthMock.value = 780

    renderInBrowser(FileViewer, {
      props: {
        items: [],
        viewMode: 'grid',
      },
      slots: {
        'background-context-menu': () =>
          h('div', { 'data-testid': 'empty-background-context-menu-content' }, 'empty-background'),
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(document.querySelectorAll('[data-testid="context-menu-root"]')).toHaveLength(1)
    await expect.element(page.getByTestId('empty-background-context-menu-content')).toHaveTextContent('empty-background')
  })

  it('窄列表视图下会同时隐藏 modifiedAt 列头和内容', async () => {
    viewportWidthMock.value = 520

    renderInBrowser(FileViewer, {
      props: {
        items: [createItem(1)],
        viewMode: 'list',
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(document.body.textContent ?? '').not.toContain('common.fileMeta.modifiedAt')
    await expect.element(page.getByLabelText('common.fileMeta.modifiedAt')).not.toBeInTheDocument()
  })

  it('保持 viewport expose 与 #icon slot 契约', async () => {
    scrollToIndexMock.mockClear()
    viewportWidthMock.value = 780

    const FileViewerHarness = defineComponent({
      name: 'FileViewerHarness',
      setup() {
        const fileViewerRef = ref<InstanceType<typeof FileViewer>>()
        const hasViewport = ref(false)

        function handleScrollClick() {
          fileViewerRef.value?.scrollToIndex(0)
        }

        onMounted(() => {
          hasViewport.value = fileViewerRef.value?.viewport instanceof HTMLElement
        })

        return () =>
          h('div', [
            h(FileViewer, {
              ref: fileViewerRef,
              items: [createItem(1)],
              viewMode: 'grid',
            }, {
              icon: ({ iconSize, item }: { iconSize: number, item: FileViewerItem }) =>
                h('span', { 'data-testid': 'icon-slot-probe' }, `${item.name}:${iconSize}`),
            }),
            h('button', {
              'type': 'button',
              'data-testid': 'scroll-trigger',
              'onClick': handleScrollClick,
            }, 'scroll'),
            h('output', { 'data-testid': 'viewport-ready' }, hasViewport.value ? 'yes' : 'no'),
          ])
      },
    })

    renderInBrowser(FileViewerHarness, {
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('viewport-ready')).toHaveTextContent('yes')
    await expect.element(page.getByTestId('icon-slot-probe')).toHaveTextContent(/^file-1\.txt:\d+$/)

    await page.getByTestId('scroll-trigger').click()
    expect(scrollToIndexMock).toHaveBeenCalled()
  })

  it('expose 会按当前排序结果滚动到指定路径', async () => {
    scrollToIndexMock.mockClear()
    viewportWidthMock.value = 780

    const FileViewerHarness = defineComponent({
      name: 'FileViewerScrollToPathHarness',
      setup() {
        const fileViewerRef = ref<InstanceType<typeof FileViewer>>()

        function handleScrollClick() {
          fileViewerRef.value?.scrollToItemPath('/assets/file-2.txt')
        }

        return () =>
          h('div', [
            h(FileViewer, {
              ref: fileViewerRef,
              items: [
                createItem(2),
                createItem(1),
              ],
              sortBy: 'name',
              sortOrder: 'asc',
              viewMode: 'list',
            }),
            h('button', {
              'type': 'button',
              'data-testid': 'scroll-path-trigger',
              'onClick': handleScrollClick,
            }, 'scroll-path'),
          ])
      },
    })

    renderInBrowser(FileViewerHarness, {
      global: {
        stubs: globalStubs,
      },
    })

    document.querySelector<HTMLElement>('[data-testid="scroll-path-trigger"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(scrollToIndexMock).toHaveBeenCalledWith(1)
  })
})
