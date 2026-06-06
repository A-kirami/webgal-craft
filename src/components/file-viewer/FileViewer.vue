<script setup lang="ts">
import { File, FileImage, FileJson2, FileMusic, FileVideo, Folder } from '@lucide/vue'

import { useFileViewerLayout } from '~/components/file-viewer/useFileViewerLayout'
import { useFileViewerVirtualizer } from '~/components/file-viewer/useFileViewerVirtualizer'
import { useDragSession } from '~/composables/useDragSession'
import { useDragSource } from '~/composables/useDragTransfer'
import { useDroppableRegistry } from '~/composables/useDroppableRegistry'
import { resolveAssetUrl } from '~/services/platform/asset-url'
import { FileViewerItem, FileViewerPreviewSize, FileViewerSortBy, FileViewerSortOrder } from '~/types/file-viewer'
import { createItemComparator } from '~/utils/sort'

import type { StyleValue } from 'vue'
import type { DragTransferOperation, FileSystemDragPayload } from '~/types/drag-drop'
import type { SortableItemAccessor } from '~/utils/sort'

interface FileViewerProps {
  /** 要展示的文件/文件夹列表 */
  items: FileViewerItem[]
  /** 当前需要额外高亮的条目路径 */
  highlightedItemPath?: string
  /** 资源预览的工作区根目录 */
  previewCwd?: string
  /** 资源预览服务地址 */
  previewBaseUrl?: string
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
  /** 是否启用应用内资源拖拽转移 */
  enableDragTransfer?: boolean
  /** 当前目录 drop target，用于把资源拖入当前浏览目录 */
  dropTargetDirectory?: FileViewerItem
  /** 判断资源是否能投放到目标目录 */
  canDropFileTransfer?: (
    payload: FileSystemDragPayload,
    targetDirectory: FileViewerItem,
    operation: DragTransferOperation,
  ) => boolean
}

interface FileViewerEmits {
  /** 文件被单击选中 */
  'select': [item: FileViewerItem]
  /** 资源项被鼠标中键点击 */
  'auxclick': [item: FileViewerItem]
  /** 文件夹被单击，请求导航进入 */
  'navigate': [item: FileViewerItem]
  /** 更新排序字段 */
  'update:sortBy': [sortBy: FileViewerSortBy]
  /** 更新排序方向 */
  'update:sortOrder': [sortOrder: FileViewerSortOrder]
  /** 文件拖拽投放到目录 */
  'fileTransferDrop': [
    payload: FileSystemDragPayload,
    targetDirectory: FileViewerItem,
    operation: DragTransferOperation,
  ]
}

interface FileViewerExpose {
  scrollToIndex: (index: number) => void
  scrollToItemPath: (path: string) => void
  viewport: HTMLElement | undefined
}

defineSlots<{
  'icon'?: (props: { item: FileViewerItem, iconSize: number }) => unknown
  'context-menu'?: (props: { item: FileViewerItem }) => unknown
  'background-context-menu'?: () => unknown
}>()

const {
  items,
  highlightedItemPath,
  previewCwd,
  previewBaseUrl,
  viewMode = 'list',
  sortBy = 'name',
  sortOrder = 'asc',
  sortableHeaders = true,
  isLoading = false,
  errorMsg = '',
  gridItemMinWidth = 80,
  zoom,
  enableDragTransfer = false,
  dropTargetDirectory,
  canDropFileTransfer,
} = defineProps<FileViewerProps>()

const emit = defineEmits<FileViewerEmits>()

const scrollAreaRef = useTemplateRef<InstanceType<typeof ScrollArea>>('scrollAreaRef')
const viewportElement = computed(() => scrollAreaRef.value?.viewport?.viewportElement as HTMLElement | undefined)
const dragSession = useDragSession()
const dropRegistry = useDroppableRegistry()
let rootDropTargetElement = $ref<HTMLElement>()
let rootDropTargetPath = $ref<string>()
let isRootDropTargetActive = $ref(false)
let ownedFileViewerDragPayload = $ref<FileSystemDragPayload>()

const DRAG_OVERLAY_OFFSET_X = 6
const DRAG_OVERLAY_OFFSET_Y = 6
const DRAG_PREVIEW_SIZE = Object.freeze({
  width: 64,
  height: 64,
})

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

const isEmptyState = computed(() =>
  !isLoading && !errorMsg && sortedItems.value.length === 0,
)

const shouldShowState = computed(() =>
  isLoading || !!errorMsg || isEmptyState.value,
)

function resolveBuiltInPreviewUrl(item: FileViewerItem, previewSize: FileViewerPreviewSize): string | undefined {
  if (item.isDir || !item.mimeType?.startsWith('image/')) {
    return undefined
  }

  if (!previewCwd || !previewBaseUrl) {
    return undefined
  }

  try {
    return resolveAssetUrl(item.path, {
      cwd: previewCwd,
      cacheVersion: item.modifiedAt,
      previewBaseUrl,
      thumbnail: {
        width: previewSize.width,
        height: previewSize.height,
        resizeMode: 'contain',
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    void logger.error(`[FileViewer] 资源地址生成失败: ${item.path} - ${errorMessage}`)
    return undefined
  }
}

const previewUrlResolver = computed(() =>
  previewCwd && previewBaseUrl
    ? resolveBuiltInPreviewUrl
    : undefined,
)

const virtualizer = useFileViewerVirtualizer({
  viewMode: () => viewMode,
  sortedItems,
  gridCols: layout.gridCols,
  gridItemHeight: layout.gridItemHeight,
  listItemHeight: layout.listItemHeight,
  viewportElement,
})

const fileDragSource = useDragSource<FileSystemDragPayload>({
  autoScroll: {
    container: viewportElement,
    edgeSize: 40,
  },
  getData: getFileViewerDragPayload,
  type: 'file-system-item',
})

const globalFileViewerPayload = $computed(() => {
  const state = dragSession.state.value
  if (
    !state.isActive
    || state.mode !== 'transfer'
    || state.payload?.type !== 'file-system-item'
    || state.payload.source !== 'file-viewer'
  ) {
    return
  }

  return state.payload
})

const activeFileViewerItem = $computed(() => {
  if (!globalFileViewerPayload || globalFileViewerPayload !== ownedFileViewerDragPayload) {
    return
  }

  return sortedItems.value.find(item => item.path === globalFileViewerPayload.path)
})

const activeFileViewerPayload = $computed(() => {
  if (!enableDragTransfer || !activeFileViewerItem) {
    return
  }

  return globalFileViewerPayload
})

const dragOverlayStyle = $computed<StyleValue | undefined>(() => {
  const currentPosition = dragSession.state.value.currentPosition
  if (!activeFileViewerPayload || !currentPosition) {
    return
  }

  return {
    transform: `translate3d(${currentPosition.x + DRAG_OVERLAY_OFFSET_X}px, ${currentPosition.y + DRAG_OVERLAY_OFFSET_Y}px, 0)`,
    zIndex: '9999',
  }
})

const dragPreviewName = $computed(() =>
  activeFileViewerPayload?.name || activeFileViewerPayload?.path || '',
)

const dragPreviewThumbnailUrl = $computed(() => {
  if (
    !activeFileViewerItem
    || activeFileViewerItem.isDir
    || !activeFileViewerItem.mimeType?.startsWith('image/')
    || !previewUrlResolver.value
  ) {
    return
  }

  return previewUrlResolver.value(activeFileViewerItem, DRAG_PREVIEW_SIZE)
})

const dragPreviewIcon = $computed(() =>
  getDragPreviewIcon(activeFileViewerItem, activeFileViewerPayload),
)

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

watch(
  [viewportElement, () => enableDragTransfer, () => dropTargetDirectory],
  () => {
    registerRootDropTarget()
  },
  { flush: 'post', immediate: true },
)

tryOnUnmounted(() => {
  unregisterRootDropTarget()
})

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

function handleItemAuxClick(item: FileViewerItem) {
  if (!item.path) {
    return
  }
  emit('auxclick', item)
}

function getFileViewerDragPayload(element: HTMLElement): FileSystemDragPayload {
  const { dataset } = element
  const path = dataset.fileViewerPath ?? ''
  const name = dataset.fileViewerItemName || path
  const isDir = dataset.fileViewerIsDir === 'true'
  const mimeType = dataset.fileViewerMimeType || undefined

  ownedFileViewerDragPayload = {
    isDir,
    items: [{
      isDir,
      name,
      path,
    }],
    name,
    path,
    ...(mimeType ? { mimeType } : {}),
    source: 'file-viewer',
    type: 'file-system-item',
  }
  return ownedFileViewerDragPayload
}

function getDragPreviewIcon(
  item: FileViewerItem | undefined,
  payload: FileSystemDragPayload | undefined,
) {
  if (item?.isDir ?? payload?.isDir) {
    return Folder
  }

  const mimeType = item?.mimeType ?? payload?.mimeType ?? ''
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

function getDragSourceProps() {
  return enableDragTransfer ? fileDragSource.sourceProps() : {}
}

function canDropOnDirectory(payload: FileSystemDragPayload, targetDirectory: FileViewerItem): boolean {
  if (!enableDragTransfer || !targetDirectory.isDir) {
    return false
  }

  return canDropFileTransfer?.(
    payload,
    targetDirectory,
    dragSession.state.value.transferOperation,
  ) ?? false
}

function handleRootDragEnter(payload: FileSystemDragPayload, targetDirectory: FileViewerItem): void {
  if (canDropOnDirectory(payload, targetDirectory)) {
    isRootDropTargetActive = true
  }
}

function handleRootDragLeave(_payload: FileSystemDragPayload, targetDirectory: FileViewerItem): void {
  if (dropTargetDirectory?.path === targetDirectory.path) {
    isRootDropTargetActive = false
  }
}

function handleRootDrop(payload: FileSystemDragPayload, targetDirectory: FileViewerItem): void {
  isRootDropTargetActive = false
  if (!canDropOnDirectory(payload, targetDirectory)) {
    return
  }

  emit('fileTransferDrop', payload, targetDirectory, dragSession.state.value.transferOperation)
}

function unregisterRootDropTarget(): void {
  if (!rootDropTargetElement) {
    return
  }

  dropRegistry.unregisterDroppable(rootDropTargetElement)
  rootDropTargetElement = undefined
  rootDropTargetPath = undefined
  isRootDropTargetActive = false
}

function registerRootDropTarget(): void {
  const element = viewportElement.value
  const targetDirectory = dropTargetDirectory

  if (
    rootDropTargetElement
    && (
      rootDropTargetElement !== element
      || rootDropTargetPath !== targetDirectory?.path
    )
  ) {
    unregisterRootDropTarget()
  }

  if (!enableDragTransfer || !targetDirectory?.isDir || !element) {
    unregisterRootDropTarget()
    return
  }

  rootDropTargetElement = element
  rootDropTargetPath = targetDirectory.path
  dropRegistry.registerDroppable(element, {
    accept: 'file-system-item',
    canDrop: payload => canDropOnDirectory(payload as FileSystemDragPayload, targetDirectory),
    id: `file-viewer:root:${targetDirectory.path}`,
    onDragEnter: payload => handleRootDragEnter(payload as FileSystemDragPayload, targetDirectory),
    onDragLeave: payload => handleRootDragLeave(payload as FileSystemDragPayload, targetDirectory),
    onDrop: payload => handleRootDrop(payload as FileSystemDragPayload, targetDirectory),
  })
}

function handleBodyFileTransferDrop(
  payload: FileSystemDragPayload,
  targetDirectory: FileViewerItem,
  operation: DragTransferOperation,
): void {
  emit('fileTransferDrop', payload, targetDirectory, operation)
}

function scrollToIndex(index: number) {
  virtualizer.scrollToIndex(index)
}

function scrollToItemPath(path: string) {
  const targetIndex = sortedItems.value.findIndex(item => item.path === path)
  if (targetIndex === -1) {
    return
  }

  scrollToIndex(targetIndex)
}

const fileViewerExpose: FileViewerExpose = {
  scrollToIndex,
  scrollToItemPath,
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
    <div
      :class="[
        'flex-1 min-h-0',
        isRootDropTargetActive ? 'bg-accent/35' : '',
      ]"
    >
      <ScrollArea ref="scrollAreaRef" class="flex-scroll-area h-full min-h-0">
        <ContextMenu v-if="isEmptyState && $slots['background-context-menu']">
          <ContextMenuTrigger as-child>
            <div class="h-full min-h-0">
              <FileViewerState
                :is-loading="isLoading"
                :error-msg="errorMsg"
                :is-empty="isEmptyState"
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-52" @close-auto-focus.prevent>
            <slot name="background-context-menu" />
          </ContextMenuContent>
        </ContextMenu>

        <FileViewerState
          v-else-if="shouldShowState"
          :is-loading="isLoading"
          :error-msg="errorMsg"
          :is-empty="isEmptyState"
        />

        <FileViewerBody
          v-else
          :active-root-drop-target="isRootDropTargetActive"
          :can-drop-file-transfer="canDropFileTransfer"
          :enable-drag-transfer="enableDragTransfer"
          :highlighted-item-path="highlightedItemPath"
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
          :get-drag-source-props="getDragSourceProps"
          :resolve-preview-url="previewUrlResolver"
          @file-transfer-drop="handleBodyFileTransferDrop"
          @item-aux-click="handleItemAuxClick"
          @item-click="handleItemClick"
        >
          <template v-if="$slots.icon" #icon="{ item, iconSize }">
            <slot name="icon" :item="item" :icon-size="iconSize" />
          </template>
          <template v-if="$slots['context-menu']" #context-menu="{ item }">
            <slot name="context-menu" :item="item" />
          </template>
          <template v-if="$slots['background-context-menu']" #background-context-menu>
            <slot name="background-context-menu" />
          </template>
        </FileViewerBody>
      </ScrollArea>
    </div>
    <DragOverlay :visible="activeFileViewerPayload !== undefined" :overlay-style="dragOverlayStyle">
      <div class="text-popover-foreground p-2 border border-border/70 rounded-md bg-popover flex flex-col gap-1.5 w-20 shadow-lg items-center" data-testid="file-viewer-drag-preview">
        <div class="flex size-16 items-center justify-center overflow-hidden">
          <img
            v-if="dragPreviewThumbnailUrl"
            :alt="dragPreviewName"
            :src="dragPreviewThumbnailUrl"
            class="h-full w-full object-contain"
            data-testid="file-viewer-drag-preview-thumbnail"
            draggable="false"
          >
          <component
            :is="dragPreviewIcon"
            v-else
            class="text-muted-foreground size-12"
            data-testid="file-viewer-drag-preview-icon"
            :stroke-width="1.5"
          />
        </div>
        <span class="text-[11px] leading-snug text-center w-full truncate">
          {{ dragPreviewName }}
        </span>
      </div>
    </DragOverlay>
  </div>
</template>
