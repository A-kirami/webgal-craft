<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual'
import { File, FileImage, FileJson2, FileMusic, FileVideo, Folder } from 'lucide-vue-next'

import type { ScrollArea } from '~/components/ui/scroll-area'

interface FileViewerProps {
  /** 要展示的文件/文件夹列表 */
  items: FileViewerItem[]
  /** 视图模式 */
  viewMode?: 'list' | 'grid'
  /** 排序字段 */
  sortBy?: 'name' | 'modifiedTime'
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc'
  /** 是否目录优先 */
  folderFirst?: boolean
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
  select: [item: FileViewerItem]
  /** 文件夹被单击，请求导航进入 */
  navigate: [item: FileViewerItem]
}

interface FileViewerExpose {
  scrollToIndex: (index: number) => void
  viewport: HTMLElement | undefined
}

const props = withDefaults(defineProps<FileViewerProps>(), {
  viewMode: 'list',
  sortBy: 'name',
  sortOrder: 'asc',
  folderFirst: true,
  isLoading: false,
  errorMsg: '',
  gridItemMinWidth: 100,
})

const emit = defineEmits<FileViewerEmits>()

const scrollAreaRef = useTemplateRef<InstanceType<typeof ScrollArea>>('scrollAreaRef')

const viewportElement = $computed(() => scrollAreaRef.value?.viewport?.viewportElement as HTMLElement | undefined)

const normalizedZoom = $computed(() => Math.max(50, Math.min(150, props.zoom ?? 100)))

const gridItemWidth = $computed(() => Math.max(48, Math.round(props.gridItemMinWidth * (normalizedZoom / 100))))
const gridPreviewSize = $computed(() => Math.max(40, Math.round(gridItemWidth * 0.8)))
const gridIconSize = $computed(() => Math.max(24, Math.round(gridPreviewSize * 0.75)))
const listItemHeight = $computed(() => Math.max(36, Math.round(40 * (normalizedZoom / 100))))
const listPreviewSize = $computed(() => Math.max(16, Math.round(20 * (normalizedZoom / 100))))

const { width: viewportWidth } = useElementSize(scrollAreaRef)
const gridCols = $computed(() => {
  const width = viewportWidth.value || gridItemWidth
  return Math.max(1, Math.floor(width / gridItemWidth))
})

const sortedItems = $computed(() => props.items.toSorted(compareFileViewerItems))
const rowCount = $computed(() => Math.ceil(sortedItems.length / gridCols))

const rowVirtualizer = useVirtualizer(computed(() => ({
  count: props.viewMode === 'grid' ? rowCount : sortedItems.length,
  // eslint-disable-next-line unicorn/no-null
  getScrollElement: () => viewportElement ?? null,
  estimateSize: () => props.viewMode === 'grid' ? gridPreviewSize + 40 : listItemHeight,
  overscan: 5,
  getItemKey: index => props.viewMode === 'grid'
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

watch(
  () => [props.viewMode, sortedItems.length, gridCols, gridItemWidth, listItemHeight, listPreviewSize],
  () => {
    rowVirtualizer.value.measure()
  },
  { flush: 'post' },
)

function compareFileViewerItems(a: FileViewerItem, b: FileViewerItem): number {
  if (props.folderFirst && a.isDir !== b.isDir) {
    return a.isDir ? -1 : 1
  }

  const result = props.sortBy === 'modifiedTime' ? compareByModifiedTime(a, b) : compareByName(a, b)
  return props.sortOrder === 'desc' ? -result : result
}

function compareByName(a: FileViewerItem, b: FileViewerItem): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

function compareByModifiedTime(a: FileViewerItem, b: FileViewerItem): number {
  const diff = (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0)
  return diff === 0 ? compareByName(a, b) : diff
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

function scrollToIndex(index: number) {
  if (sortedItems.length === 0) {
    return
  }

  const safeIndex = Math.min(Math.max(index, 0), sortedItems.length - 1)
  if (props.viewMode === 'grid') {
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
  <ScrollArea ref="scrollAreaRef">
    <!-- 加载中状态 -->
    <div v-if="props.isLoading" class="flex flex-col h-full w-full items-center justify-center" role="status" aria-live="polite">
      <div class="i-svg-spinners-ring-resize text-accent mb-2 size-8 animate-spin" />
      <span class="sr-only">{{ $t('common.loading') }}</span>
    </div>

    <!-- 加载失败状态 -->
    <div v-else-if="props.errorMsg" class="flex flex-col h-full w-full items-center justify-center">
      <div class="i-lucide-alert-triangle text-destructive mb-2 size-10" />
      <span class="text-xs text-destructive">{{ $t('common.fileViewer.loadFailed', { error: props.errorMsg }) }}</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="sortedItems.length === 0" class="flex flex-col h-full w-full items-center justify-center">
      <div class="i-lucide-folder-open text-muted-foreground mb-2 size-10" />
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
          v-if="props.viewMode === 'grid'"
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
          <div class="text-xs text-left min-w-0 truncate">
            {{ item.name }}
          </div>
        </button>
      </div>
    </div>
  </ScrollArea>
</template>
