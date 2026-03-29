<script setup lang="ts">
import { useFileViewerLayout } from '~/components/file-viewer/useFileViewerLayout'
import { useFileViewerVirtualizer } from '~/components/file-viewer/useFileViewerVirtualizer'
import { FileViewerItem, FileViewerPreviewSize, FileViewerSortBy, FileViewerSortOrder } from '~/types/file-viewer'
import { createItemComparator } from '~/utils/sort'

import type { SortableItemAccessor } from '~/utils/sort'

interface FileViewerProps {
  /** 要展示的文件/文件夹列表 */
  items: FileViewerItem[]
  /** 调用方可选提供图片预览地址解析器，通用文件视图本身不绑定具体预览实现 */
  resolvePreviewUrl?: (item: FileViewerItem, previewSize: FileViewerPreviewSize) => string | undefined
  /** 视图模式 */
  viewMode?: 'list' | 'grid'
  /** 排序字段 */
  sortBy?: FileViewerSortBy
  /** 排序方向 */
  sortOrder?: FileViewerSortOrder
  /** 列表表头是否允许点击排序 */
  sortableHeaders?: boolean
  /** 加载中状态 */
  isLoading?: boolean
  /** 错误信息 */
  errorMsg?: string
  /** 网格模式下单个项的最小宽度 */
  gridItemMinWidth?: number
  /** 缩放比例（50-150） */
  zoom?: number
}

interface FileViewerEmits {
  /** 文件被单击选中 */
  'select': [item: FileViewerItem]
  /** 文件夹被单击，请求导航进入 */
  'navigate': [item: FileViewerItem]
  /** 更新排序字段 */
  'update:sortBy': [sortBy: FileViewerSortBy]
  /** 更新排序方向 */
  'update:sortOrder': [sortOrder: FileViewerSortOrder]
}

interface FileViewerExpose {
  scrollToIndex: (index: number) => void
  viewport: HTMLElement | undefined
}

const {
  items,
  resolvePreviewUrl,
  viewMode = 'list',
  sortBy = 'name',
  sortOrder = 'asc',
  sortableHeaders = true,
  isLoading = false,
  errorMsg = '',
  gridItemMinWidth = 80,
  zoom,
} = defineProps<FileViewerProps>()

const emit = defineEmits<FileViewerEmits>()

const scrollAreaRef = useTemplateRef<InstanceType<typeof ScrollArea>>('scrollAreaRef')
const viewportElement = computed(() => scrollAreaRef.value?.viewport?.viewportElement as HTMLElement | undefined)

const { width: viewportWidth } = useElementSize(() => viewportElement.value)
const contentWidth = computed(() => viewportWidth.value || 0)

const layout = useFileViewerLayout({
  contentWidth,
  gridItemMinWidth: () => gridItemMinWidth,
  zoom: () => zoom,
})

const fileViewerAccessor: SortableItemAccessor<FileViewerItem> = {
  isDirectory: item => item.isDir,
  name: item => item.name,
  size: item => item.size,
  modifiedAt: item => item.modifiedAt,
  createdAt: item => item.createdAt,
}

const sortedItems = computed(() =>
  items.toSorted(createItemComparator(sortBy, sortOrder, fileViewerAccessor)),
)

const virtualizer = useFileViewerVirtualizer({
  viewMode: () => viewMode,
  sortedItems,
  gridCols: layout.gridCols,
  gridItemHeight: layout.gridItemHeight,
  listItemHeight: layout.listItemHeight,
  viewportElement,
})

watch(
  () => [
    viewMode,
    sortedItems.value.length,
    layout.gridCols.value,
    layout.gridItemHeight.value,
    layout.listItemHeight.value,
    layout.listPreviewSize.value,
  ],
  () => {
    virtualizer.measure()
  },
  { flush: 'post' },
)

function handleItemClick(item: FileViewerItem) {
  if (!item.path) {
    return
  }
  if (item.isDir) {
    emit('navigate', item)
    return
  }
  emit('select', item)
}

function scrollToIndex(index: number) {
  virtualizer.scrollToIndex(index)
}

const fileViewerExpose: FileViewerExpose = {
  scrollToIndex,
  get viewport() {
    return viewportElement.value
  },
}

defineExpose(fileViewerExpose)
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <FileViewerHeader
      v-if="virtualizer.showListHeader.value"
      :list-preview-size="layout.listPreviewSize.value"
      :show-list-size="layout.showListSize.value"
      :show-list-modified-at="layout.showListModifiedAt.value"
      :show-list-created-at="layout.showListCreatedAt.value"
      :sort-by="sortBy"
      :sort-order="sortOrder"
      :sortable-headers="sortableHeaders"
      @update:sort-by="(nextSortBy) => emit('update:sortBy', nextSortBy)"
      @update:sort-order="(nextSortOrder) => emit('update:sortOrder', nextSortOrder)"
    />
    <div class="flex-1 min-h-0">
      <ScrollArea ref="scrollAreaRef" class="flex-scroll-area h-full min-h-0">
        <FileViewerState
          v-if="isLoading || errorMsg || sortedItems.length === 0"
          :is-loading="isLoading"
          :error-msg="errorMsg"
          :is-empty="!isLoading && !errorMsg && sortedItems.length === 0"
        />

        <FileViewerBody
          v-else
          :view-mode="viewMode"
          :virtual-rows="virtualizer.virtualRows.value"
          :total-size="virtualizer.totalSize.value"
          :grid-cols="layout.gridCols.value"
          :grid-preview-size="layout.gridPreviewSize.value"
          :grid-icon-size="layout.gridIconSize.value"
          :list-preview-size="layout.listPreviewSize.value"
          :list-item-height="layout.listItemHeight.value"
          :show-list-size="layout.showListSize.value"
          :show-list-modified-at="layout.showListModifiedAt.value"
          :show-list-created-at="layout.showListCreatedAt.value"
          :get-grid-row-items="virtualizer.getGridRowItems"
          :get-list-item="virtualizer.getListItem"
          :resolve-preview-url="resolvePreviewUrl"
          @item-click="handleItemClick"
        >
          <template v-if="$slots.icon" #icon="{ item, iconSize }">
            <slot name="icon" :item="item" :icon-size="iconSize" />
          </template>
        </FileViewerBody>
      </ScrollArea>
    </div>
  </div>
</template>
