import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, nextTick, onMounted, ref } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import { useFileViewerLayout } from '~/components/file-viewer/useFileViewerLayout'
import { useFileViewerVirtualizer } from '~/components/file-viewer/useFileViewerVirtualizer'

import FileViewer from './FileViewer.vue'

import type { FileViewerItem, FileViewerPreviewSize } from '~/types/file-viewer'

const {
  measureMock,
  resolvePreviewUrlMock,
  scrollToIndexMock,
  viewportWidthMock,
} = vi.hoisted(() => ({
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

const BASE_TIMESTAMP = Date.parse('2023-11-14T00:00:00Z')

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

function createPreviewUrl(item: FileViewerItem): string {
  const previewPath = item.path.replace(/\.[^./\\]+$/, '.png')
  return `http://127.0.0.1:8899/game/demo${previewPath}?t=${item.modifiedAt ?? 0}`
}

const globalStubs = {
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
        items: [createImageItem(1)],
        resolvePreviewUrl: (item: FileViewerItem, preview: FileViewerPreviewSize) => resolvePreviewUrlMock(item, preview),
        viewMode,
      }, {
        icon: ({ item }: { item: FileViewerItem, iconSize: number }) =>
          h('span', { 'data-testid': `${viewMode}-icon-fallback` }, `${item.name}-fallback`),
      })
    },
  })
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
    resolvePreviewUrlMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
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

    expect(resolvePreviewUrlMock).not.toHaveBeenCalled()
    await expect.element(page.getByAltText('file-1.txt')).not.toBeInTheDocument()
  })

  it('网格模式图片项会使用带 modifiedAt 的 HTTP URL', async () => {
    const item = createImageItem(1)
    viewportWidthMock.value = 780
    resolvePreviewUrlMock.mockImplementation((resolvedItem: FileViewerItem) => createPreviewUrl(resolvedItem))

    renderInBrowser(FileViewer, {
      props: {
        items: [item],
        resolvePreviewUrl: (resolvedItem: FileViewerItem, preview: FileViewerPreviewSize) => resolvePreviewUrlMock(resolvedItem, preview),
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(resolvePreviewUrlMock).toHaveBeenCalledWith(expect.objectContaining({
      path: item.path,
      modifiedAt: item.modifiedAt,
      mimeType: item.mimeType,
    }), {
      height: 64,
      width: 64,
    })
    await expect.element(page.getByAltText(item.name)).toHaveAttribute('src', createPreviewUrl(item))
  })

  it('列表模式图片项也会使用 HTTP URL', async () => {
    const item = createImageItem(1)
    viewportWidthMock.value = 780
    resolvePreviewUrlMock.mockImplementation((resolvedItem: FileViewerItem) => createPreviewUrl(resolvedItem))

    renderInBrowser(FileViewer, {
      props: {
        items: [item],
        resolvePreviewUrl: (resolvedItem: FileViewerItem, preview: FileViewerPreviewSize) => resolvePreviewUrlMock(resolvedItem, preview),
        viewMode: 'list',
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(resolvePreviewUrlMock).toHaveBeenCalledWith(expect.objectContaining({
      path: item.path,
      modifiedAt: item.modifiedAt,
      mimeType: item.mimeType,
    }), {
      height: 20,
      width: 20,
    })
    await expect.element(page.getByAltText(item.name)).toHaveAttribute('src', createPreviewUrl(item))
  })

  it('网格模式图片加载失败后会回退到图标槽位', async () => {
    viewportWidthMock.value = 780
    resolvePreviewUrlMock.mockImplementation((item: FileViewerItem) => createPreviewUrl(item))

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
    resolvePreviewUrlMock.mockImplementation((item: FileViewerItem) => createPreviewUrl(item))

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
    const item = createImageItem(1)
    const queryImage = () => document.querySelector<HTMLImageElement>(`img[alt="${item.name}"]`)

    vi.useFakeTimers()
    viewportWidthMock.value = 780
    resolvePreviewUrlMock.mockImplementation((resolvedItem: FileViewerItem) => createPreviewUrl(resolvedItem))

    const result = await renderInBrowser(FileViewer, {
      props: {
        items: [item],
        resolvePreviewUrl: (resolvedItem: FileViewerItem, preview: FileViewerPreviewSize) => resolvePreviewUrlMock(resolvedItem, preview),
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(queryImage()?.getAttribute('src')).toBe(createPreviewUrl(item))

    queryImage()?.dispatchEvent(new Event('error'))
    await nextTick()

    expect(queryImage()).toBeNull()

    await vi.advanceTimersByTimeAsync(5000)
    await nextTick()

    expect(queryImage()?.getAttribute('src')).toBe(createPreviewUrl(item))
    await result.unmount()
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
})
