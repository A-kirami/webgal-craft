<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual'
import { AlertTriangle, ArrowDown, ArrowUp, File, FileImage, FileJson2, FileMusic, FileVideo, Folder, FolderOpen } from 'lucide-vue-next'

import type { ScrollArea } from '~/components/ui/scroll-area'

interface FileViewerProps {
  /** 要展示的文件/文件夹列表 */
  items: FileViewerItem[]
  /** 视图模式 */
  viewMode?: 'list' | 'grid'
  /** 排序字段 */
  sortBy?: FileViewerSortBy
  /** 排序方向 */
  sortOrder?: FileViewerSortOrder
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

const META_BREAKPOINT_FULL = 750
const META_BREAKPOINT_COMPACT = 560
const FILE_SIZE_UNITS = ['B', 'KiB', 'MiB', 'GiB'] as const

const {
  items,
  viewMode = 'list',
  sortBy = 'name',
  sortOrder = 'asc',
  isLoading = false,
  errorMsg = '',
  gridItemMinWidth = 100,
  zoom,
} = defineProps<FileViewerProps>()

const emit = defineEmits<FileViewerEmits>()

const scrollAreaRef = useTemplateRef<InstanceType<typeof ScrollArea>>('scrollAreaRef')

const viewportElement = $computed(() => scrollAreaRef.value?.viewport?.viewportElement as HTMLElement | undefined)

const normalizedZoom = $computed(() => Math.max(50, Math.min(150, zoom ?? 100)))

const gridItemWidth = $computed(() => Math.max(48, Math.round(gridItemMinWidth * (normalizedZoom / 100))))
const gridPreviewSize = $computed(() => Math.max(40, Math.round(gridItemWidth * 0.8)))
const gridItemHeight = $computed(() => gridPreviewSize + 40)
const gridIconSize = $computed(() => Math.max(24, Math.round(gridPreviewSize * 0.75)))
const listItemHeight = $computed(() => Math.max(36, Math.round(40 * (normalizedZoom / 100))))
const listPreviewSize = $computed(() => Math.max(16, Math.round(20 * (normalizedZoom / 100))))

const { width: viewportWidth } = useElementSize(() => viewportElement)
const contentWidth = $computed(() => viewportWidth.value || 0)

let listMetaDensity = $ref<1 | 2 | 3>(3)

/**
 * 根据宽度和当前密度计算目标密度（带迟滞缓冲，避免边界抖动）
 * 向上跨越断点需超过 breakpoint + buffer，向下需低于 breakpoint - buffer
 */
function computeMetaDensity(width: number, current: 1 | 2 | 3, buffer: number): 1 | 2 | 3 {
  const fullUp = META_BREAKPOINT_FULL + buffer
  const fullDown = META_BREAKPOINT_FULL - buffer
  const compactUp = META_BREAKPOINT_COMPACT + buffer
  const compactDown = META_BREAKPOINT_COMPACT - buffer

  if (current === 3) {
    if (width < compactDown) {
      return 1
    }
    if (width < fullDown) {
      return 2
    }
    return 3
  }
  if (current === 2) {
    if (width >= fullUp) {
      return 3
    }
    if (width < compactDown) {
      return 1
    }
    return 2
  }
  // current === 1
  if (width >= fullUp) {
    return 3
  }
  if (width >= compactUp) {
    return 2
  }
  return 1
}

watch(
  () => [contentWidth, normalizedZoom] as const,
  ([width, zoom]) => {
    if (width <= 0) {
      listMetaDensity = 3
      return
    }
    const buffer = Math.max(12, Math.round(24 + (zoom - 100) * 0.2))
    listMetaDensity = computeMetaDensity(width, listMetaDensity, buffer)
  },
  { immediate: true },
)

const showListSize = $computed(() => listMetaDensity >= 2)
const showListCreatedAt = $computed(() => listMetaDensity >= 3)

const gridCols = $computed(() => {
  const width = contentWidth || gridItemWidth
  return Math.max(1, Math.floor(width / gridItemWidth))
})

const sortedItems = $computed(() => items.toSorted(compareFileViewerItems))
const rowCount = $computed(() => Math.ceil(sortedItems.length / gridCols))

const rowVirtualizer = useVirtualizer(computed(() => ({
  count: viewMode === 'grid' ? rowCount : sortedItems.length,
  // eslint-disable-next-line unicorn/no-null
  getScrollElement: () => viewportElement ?? null,
  estimateSize: () => viewMode === 'grid' ? gridItemHeight : listItemHeight,
  overscan: 5,
  getItemKey: index => viewMode === 'grid'
    ? index
    : sortedItems[index]?.path ?? index,
  enabled: true,
})))

const virtualRows = $computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = $computed(() => rowVirtualizer.value.getTotalSize())
const EMPTY_LIST_ITEM: FileViewerItem = {
  name: '',
  path: '',
  isDir: false,
}
const showListHeader = $computed(() =>
  viewMode === 'list',
)

watch(
  () => [viewMode, sortedItems.length, gridCols, gridItemHeight, listItemHeight, listPreviewSize],
  () => {
    rowVirtualizer.value.measure()
  },
  { flush: 'post' },
)

function compareFileViewerItems(a: FileViewerItem, b: FileViewerItem): number {
  if (a.isDir !== b.isDir) {
    return a.isDir ? -1 : 1
  }

  if (sortBy === 'name') {
    const result = compareByName(a, b)
    return sortOrder === 'desc' ? -result : result
  }

  const sortResult = compareBySortField(a, b)
  if (sortResult !== 0) {
    return sortResult
  }

  const tieBreaker = compareByName(a, b)
  return sortOrder === 'desc' ? -tieBreaker : tieBreaker
}

function compareByName(a: FileViewerItem, b: FileViewerItem): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

function compareBySortField(a: FileViewerItem, b: FileViewerItem): number {
  return compareOptionalNumber(
    getSortNumericValue(a),
    getSortNumericValue(b),
    sortOrder,
  )
}

function getSortNumericValue(item: FileViewerItem): number | undefined {
  if (sortBy === 'size') {
    return item.isDir ? undefined : normalizeNumber(item.size)
  }
  if (sortBy === 'modifiedTime') {
    return normalizeNumber(item.modifiedAt)
  }
  if (sortBy === 'createdTime') {
    return normalizeNumber(item.createdAt)
  }
  return undefined
}

function getDefaultIconComponent(item: FileViewerItem) {
  if (item.isDir) {
    return Folder
  }
  const mimeType = item.mimeType ?? ''
  if (mimeType.startsWith('image/')) {
    return FileImage
  }
  if (mimeType.startsWith('audio/')) {
    return FileMusic
  }
  if (mimeType.startsWith('video/')) {
    return FileVideo
  }
  if (mimeType === 'application/json') {
    return FileJson2
  }
  return File
}

function isImageFile(item: FileViewerItem): boolean {
  return !item.isDir && !!item.mimeType?.startsWith('image/')
}

function getGridRowItems(rowIndex: number): FileViewerItem[] {
  const start = rowIndex * gridCols
  const end = (rowIndex + 1) * gridCols
  return sortedItems.slice(start, end)
}

function getListItem(index: number): FileViewerItem {
  return sortedItems[Math.min(Math.max(index, 0), sortedItems.length - 1)] ?? EMPTY_LIST_ITEM
}

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

function formatFileSize(bytes: number): string {
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < FILE_SIZE_UNITS.length - 1) {
    size /= 1024
    unitIndex++
  }

  if (unitIndex === 0) {
    return `${Math.round(size)} ${FILE_SIZE_UNITS[unitIndex]}`
  }

  const value = size < 10 ? size.toFixed(1) : String(Math.round(size))
  return `${value} ${FILE_SIZE_UNITS[unitIndex]}`
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
})

function formatDateTime(timestamp: number): string {
  return dateFormatter.format(timestamp)
}

function isSortColumn(field: FileViewerSortBy): boolean {
  return sortBy === field
}

function getHeaderAriaSort(field: FileViewerSortBy): 'ascending' | 'descending' | 'none' {
  if (!isSortColumn(field)) {
    return 'none'
  }
  return sortOrder === 'asc' ? 'ascending' : 'descending'
}

function handleSortHeaderClick(field: FileViewerSortBy): void {
  if (sortBy === field) {
    emit('update:sortOrder', sortOrder === 'asc' ? 'desc' : 'asc')
    return
  }

  emit('update:sortBy', field)
}

function scrollToIndex(index: number) {
  if (sortedItems.length === 0) {
    return
  }

  const safeIndex = Math.min(Math.max(index, 0), sortedItems.length - 1)
  if (viewMode === 'grid') {
    const rowIndex = Math.floor(safeIndex / gridCols)
    rowVirtualizer.value.scrollToIndex(rowIndex)
    return
  }

  rowVirtualizer.value.scrollToIndex(safeIndex)
}

const fileViewerExpose: FileViewerExpose = {
  scrollToIndex,
  get viewport() {
    return viewportElement
  },
}

defineExpose(fileViewerExpose)
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div
      v-if="showListHeader"
      class="px-2 border-b bg-background/95 flex items-center backdrop-blur-sm"
      style="height: 26px;"
    >
      <div class="flex flex-1 gap-2 min-w-0 items-center">
        <div aria-hidden="true" :style="{ width: `${listPreviewSize}px` }" />
        <button
          type="button"
          class="text-[11px] text-left rounded-sm inline-flex gap-1 min-w-0 truncate items-center hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          role="columnheader"
          :class="{ 'text-foreground font-medium': isSortColumn('name'), 'text-muted-foreground': !isSortColumn('name') }"
          :aria-sort="getHeaderAriaSort('name')"
          @click="handleSortHeaderClick('name')"
        >
          <span>{{ $t('edit.assetPanel.sort.name') }}</span>
          <ArrowUp v-if="isSortColumn('name') && sortOrder === 'asc'" class="size-3" />
          <ArrowDown v-else-if="isSortColumn('name') && sortOrder === 'desc'" class="size-3" />
        </button>
      </div>
      <div class="text-[11px] ml-2 flex shrink-0 gap-3 items-center">
        <button
          v-if="showListSize"
          type="button"
          class="text-right inline-flex gap-1 w-20 items-center justify-end"
          role="columnheader"
          :class="{ 'text-foreground font-medium': isSortColumn('size'), 'text-muted-foreground': !isSortColumn('size') }"
          :aria-sort="getHeaderAriaSort('size')"
          @click="handleSortHeaderClick('size')"
        >
          <span>{{ $t('common.fileMeta.size') }}</span>
          <ArrowUp v-if="isSortColumn('size') && sortOrder === 'asc'" class="size-3" />
          <ArrowDown v-else-if="isSortColumn('size') && sortOrder === 'desc'" class="size-3" />
        </button>
        <button
          type="button"
          class="text-left inline-flex gap-1 w-32 items-center"
          role="columnheader"
          :class="{ 'text-foreground font-medium': isSortColumn('modifiedTime'), 'text-muted-foreground': !isSortColumn('modifiedTime') }"
          :aria-sort="getHeaderAriaSort('modifiedTime')"
          @click="handleSortHeaderClick('modifiedTime')"
        >
          <span>{{ $t('common.fileMeta.modifiedAt') }}</span>
          <ArrowUp v-if="isSortColumn('modifiedTime') && sortOrder === 'asc'" class="size-3" />
          <ArrowDown v-else-if="isSortColumn('modifiedTime') && sortOrder === 'desc'" class="size-3" />
        </button>
        <button
          v-if="showListCreatedAt"
          type="button"
          class="text-left inline-flex gap-1 w-32 items-center"
          role="columnheader"
          :class="{ 'text-foreground font-medium': isSortColumn('createdTime'), 'text-muted-foreground': !isSortColumn('createdTime') }"
          :aria-sort="getHeaderAriaSort('createdTime')"
          @click="handleSortHeaderClick('createdTime')"
        >
          <span>{{ $t('common.fileMeta.createdAt') }}</span>
          <ArrowUp v-if="isSortColumn('createdTime') && sortOrder === 'asc'" class="size-3" />
          <ArrowDown v-else-if="isSortColumn('createdTime') && sortOrder === 'desc'" class="size-3" />
        </button>
      </div>
    </div>
    <div class="flex-1 min-h-0">
      <ScrollArea ref="scrollAreaRef" class="h-full min-h-0" :class="$style.fileViewerScrollArea">
        <!-- 加载中状态 -->
        <div v-if="isLoading" class="flex h-full items-center justify-center">
          <div class="text-muted-foreground flex items-center justify-center">
            <div class="border-2 border-current border-t-transparent rounded-full size-5 animate-spin" />
          </div>
          <span class="sr-only">{{ $t('common.loading') }}</span>
        </div>

        <!-- 加载失败状态 -->
        <div v-else-if="errorMsg" class="flex flex-col h-full w-full items-center justify-center">
          <AlertTriangle class="text-destructive mb-2 size-10" :stroke-width="1.25" />
          <span class="text-xs text-destructive">{{ $t('common.fileViewer.loadFailed', { error: errorMsg }) }}</span>
        </div>

        <!-- 空状态 -->
        <div v-else-if="sortedItems.length === 0" class="flex flex-col h-full w-full items-center justify-center">
          <FolderOpen class="text-muted-foreground mb-2 size-10" :stroke-width="1.25" />
          <span class="text-xs text-muted-foreground">{{ $t('common.fileViewer.noContent') }}</span>
        </div>

        <!-- 文件列表 -->
        <div v-else :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
          <div
            v-for="row in virtualRows"
            :key="String(row.key)"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${row.size}px`,
              transform: `translateY(${row.start}px)`,
            }"
          >
            <div
              v-if="viewMode === 'grid'"
              class="grid h-full"
              :style="{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }"
            >
              <button
                v-for="item in getGridRowItems(row.index)"
                :key="item.path"
                type="button"
                class="p-1.5 rounded-md flex flex-col gap-1 items-center focus-visible:outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
                @click="handleItemClick(item)"
              >
                <div
                  class="flex shrink-0 items-center justify-center"
                  :style="{ width: `${gridPreviewSize}px`, height: `${gridPreviewSize}px` }"
                >
                  <Thumbnail
                    v-if="isImageFile(item)"
                    :path="item.path"
                    :alt="item.name"
                    fit="contain"
                  />
                  <slot v-else name="icon" :item="item" :icon-size="gridIconSize">
                    <component
                      :is="getDefaultIconComponent(item)"
                      class="shrink-0"
                      :style="{ width: `${gridIconSize}px`, height: `${gridIconSize}px` }"
                      :stroke-width="1.25"
                    />
                  </slot>
                </div>
                <div class="text-xs text-center break-all line-clamp-2" :class="{ 'text-muted-foreground': item.isSupported === false }">
                  {{ item.name }}
                </div>
              </button>
            </div>

            <button
              v-for="item in [getListItem(row.index)]"
              v-else
              :key="item.path"
              type="button"
              class="p-2 rounded-md flex gap-2 w-full items-center focus-visible:outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
              :style="{ height: `${listItemHeight}px` }"
              @click="handleItemClick(item)"
            >
              <div class="flex flex-1 gap-2 min-w-0 items-center">
                <div
                  class="flex shrink-0 items-center justify-center"
                  :style="{ width: `${listPreviewSize}px`, height: `${listPreviewSize}px` }"
                >
                  <Thumbnail
                    v-if="isImageFile(item)"
                    :path="item.path"
                    :alt="item.name"
                    fit="contain"
                  />
                  <slot v-else name="icon" :item="item" :icon-size="listPreviewSize">
                    <component
                      :is="getDefaultIconComponent(item)"
                      class="shrink-0"
                      :style="{ width: `${listPreviewSize}px`, height: `${listPreviewSize}px` }"
                      :stroke-width="1.25"
                    />
                  </slot>
                </div>
                <div class="text-xs text-left min-w-0 truncate" :class="{ 'text-muted-foreground': item.isSupported === false }">
                  {{ item.name }}
                </div>
              </div>
              <div class="text-[11px] text-muted-foreground ml-2 flex shrink-0 gap-3 [font-variant-numeric:tabular-nums] items-center" role="note">
                <div v-if="showListSize" class="text-right w-20" :aria-label="$t('common.fileMeta.size')">
                  <template v-if="item.isDir">
                    <span aria-hidden="true">{{ $t('common.fileMeta.directorySize') }}</span>
                    <span class="sr-only">{{ $t('common.fileMeta.unavailableA11y') }}</span>
                  </template>
                  <template v-else-if="isValidPositiveNumber(item.size)">
                    {{ formatFileSize(item.size) }}
                  </template>
                  <template v-else>
                    <span aria-hidden="true">{{ $t('common.fileMeta.unavailable') }}</span>
                    <span class="sr-only">{{ $t('common.fileMeta.unavailableA11y') }}</span>
                  </template>
                </div>
                <div class="text-left w-32" :aria-label="$t('common.fileMeta.modifiedAt')">
                  <template v-if="isValidPositiveNumber(item.modifiedAt)">
                    {{ formatDateTime(item.modifiedAt) }}
                  </template>
                  <template v-else>
                    <span aria-hidden="true">{{ $t('common.fileMeta.unavailable') }}</span>
                    <span class="sr-only">{{ $t('common.fileMeta.unavailableA11y') }}</span>
                  </template>
                </div>
                <div v-if="showListCreatedAt" class="text-left w-32" :aria-label="$t('common.fileMeta.createdAt')">
                  <template v-if="isValidPositiveNumber(item.createdAt)">
                    {{ formatDateTime(item.createdAt) }}
                  </template>
                  <template v-else>
                    <span aria-hidden="true">{{ $t('common.fileMeta.unavailable') }}</span>
                    <span class="sr-only">{{ $t('common.fileMeta.unavailableA11y') }}</span>
                  </template>
                </div>
              </div>
            </button>
          </div>
        </div>
      </ScrollArea>
    </div>
  </div>
</template>

<style module>
.file-viewer-scroll-area {
  & [data-reka-scroll-area-viewport] {
    @apply flex flex-col;

    & > div {
      @apply flex-1;
    }
  }
}
</style>
