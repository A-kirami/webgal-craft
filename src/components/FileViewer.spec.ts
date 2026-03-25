/* eslint-disable vue/one-component-per-file */
import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, onMounted, ref } from 'vue'

import { createBrowserLiteI18n } from '~/__tests__/browser'
import { useFileViewerLayout } from '~/composables/useFileViewerLayout'
import { useFileViewerVirtualizer } from '~/composables/useFileViewerVirtualizer'

import FileViewer from './FileViewer.vue'

import type { FileViewerItem } from '~/types/file-viewer'

const {
  measureMock,
  scrollToIndexMock,
  viewportWidthMock,
} = vi.hoisted(() => ({
  measureMock: vi.fn(),
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

function stringifyThumbnailSize(size: unknown): string {
  if (typeof size === 'number') {
    return size > 0 ? String(size) : ''
  }
  if (typeof size === 'string') {
    const parsed = Number(size)
    return parsed > 0 ? String(parsed) : ''
  }
  return ''
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
  Thumbnail: defineComponent({
    name: 'StubThumbnail',
    setup(_, { attrs }) {
      return () => h('img', {
        ...attrs,
        'data-thumbnail-size': stringifyThumbnailSize(attrs.size),
      })
    },
  }),
}

describe('FileViewer composables', () => {
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

describe('FileViewer facade contract', () => {
  it('把布局派生的预览尺寸传给 Thumbnail', () => {
    viewportWidthMock.value = 780

    render(FileViewer, {
      props: {
        items: [createImageItem(1)],
        viewMode: 'grid',
      },
      global: {
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    expect(document.querySelector('img[data-thumbnail-size="64"]')).not.toBeNull()
  })

  it('列表模式下也把 listPreviewSize 传给 Thumbnail', () => {
    viewportWidthMock.value = 780

    render(FileViewer, {
      props: {
        items: [createImageItem(1)],
        viewMode: 'list',
      },
      global: {
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    expect(document.querySelector('img[data-thumbnail-size="20"]')).not.toBeNull()
  })

  it('窄列表视图下会同时隐藏 modifiedAt 列头和内容', () => {
    viewportWidthMock.value = 520

    render(FileViewer, {
      props: {
        items: [createItem(1)],
        viewMode: 'list',
      },
      global: {
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    expect(document.body.textContent ?? '').not.toContain('common.fileMeta.modifiedAt')
    expect(document.querySelector('[aria-label="common.fileMeta.modifiedAt"]')).toBeNull()
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

    render(FileViewerHarness, {
      global: {
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('viewport-ready')).toHaveTextContent('yes')
    await expect.element(page.getByTestId('icon-slot-probe')).toHaveTextContent(/^file-1\.txt:\d+$/)

    await page.getByTestId('scroll-trigger').click()
    expect(scrollToIndexMock).toHaveBeenCalled()
  })
})
