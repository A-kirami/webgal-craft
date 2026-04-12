<script setup lang="ts">
import { File, FileImage, FileJson2, FileMusic, FileVideo, Folder } from '@lucide/vue'

import { loadFileViewerImageDimensions } from '~/components/file-viewer/fileViewerImageDimensions'
import { formatFileSize } from '~/utils/format'
import { isValidPositiveNumber } from '~/utils/sort'

import type { FileViewerItem, FileViewerPreviewSize, FileViewerVirtualRow } from '~/types/file-viewer'

interface FileViewerDisplayItem {
  item: FileViewerItem
  previewUrl?: string
}

interface FailedPreviewEntry {
  failedAt: number
  previewUrl: string
}

interface FileViewerBodyProps {
  highlightedItemPath?: string
  viewMode: 'list' | 'grid'
  virtualRows: FileViewerVirtualRow[]
  totalSize: number
  gridCols: number
  gridPreviewSize: number
  gridIconSize: number
  listPreviewSize: number
  listItemHeight: number
  showListSize: boolean
  showListModifiedAt: boolean
  showListCreatedAt: boolean
  getGridRowItems: (rowIndex: number) => FileViewerItem[]
  getListItem: (index: number) => FileViewerItem
  resolvePreviewUrl?: (item: FileViewerItem, previewSize: FileViewerPreviewSize) => string | undefined
}

const {
  highlightedItemPath,
  viewMode,
  virtualRows,
  totalSize,
  gridCols,
  gridPreviewSize,
  gridIconSize,
  listPreviewSize,
  listItemHeight,
  showListSize,
  showListModifiedAt,
  showListCreatedAt,
  getGridRowItems,
  getListItem,
  resolvePreviewUrl,
} = defineProps<FileViewerBodyProps>()

const emit = defineEmits<{
  itemClick: [item: FileViewerItem]
}>()

const slots = useSlots()

const FAILED_PREVIEW_RETRY_DELAY_MS = 5000
const HOVER_PREVIEW_WARMUP_DELAY_MS = 120
const HOVER_PREVIEW_SIZE = Object.freeze({
  width: 256,
  height: 256,
})

const hasContextMenu = computed(() => !!slots['context-menu'])
const hasBackgroundContextMenu = computed(() => !!slots['background-context-menu'])
const failedPreviewUrls = reactive(new Map<string, FailedPreviewEntry>())
const pendingHoverPreviewPreloads = new Map<string, Promise<void>>()
const pendingHoverPreviewWarmupTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingPreviewRetryTimers = new Map<string, ReturnType<typeof setTimeout>>()
let openHoverPreviewPath = $ref<string>()

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

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

function formatDateTime(timestamp: number): string {
  return dateFormatter.format(timestamp)
}

function handleItemClick(item: FileViewerItem): void {
  emit('itemClick', item)
}

function clearPendingPreviewRetry(itemPath: string): void {
  const pendingTimer = pendingPreviewRetryTimers.get(itemPath)
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingPreviewRetryTimers.delete(itemPath)
  }
}

function schedulePreviewRetry(itemPath: string, previewUrl: string): void {
  clearPendingPreviewRetry(itemPath)

  const pendingTimer = setTimeout(() => {
    pendingPreviewRetryTimers.delete(itemPath)

    const failedPreview = failedPreviewUrls.get(itemPath)
    if (failedPreview?.previewUrl === previewUrl) {
      failedPreviewUrls.delete(itemPath)
    }
  }, FAILED_PREVIEW_RETRY_DELAY_MS)

  pendingPreviewRetryTimers.set(itemPath, pendingTimer)
}

function clearPendingHoverPreviewWarmup(itemPath: string): void {
  const pendingTimer = pendingHoverPreviewWarmupTimers.get(itemPath)
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingHoverPreviewWarmupTimers.delete(itemPath)
  }
}

function preloadPreviewUrl(previewUrl: string): Promise<void> {
  if (typeof Image === 'undefined') {
    return Promise.resolve()
  }

  const pendingRequest = pendingHoverPreviewPreloads.get(previewUrl)
  if (pendingRequest) {
    return pendingRequest
  }

  const request = new Promise<void>((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.addEventListener('load', () => resolve(), { once: true })
    image.addEventListener('error', () => resolve(), { once: true })
    image.src = previewUrl
  }).finally(() => {
    pendingHoverPreviewPreloads.delete(previewUrl)
  })

  pendingHoverPreviewPreloads.set(previewUrl, request)
  return request
}

function resolveDisplayPreviewUrl(item: FileViewerItem, previewSize: FileViewerPreviewSize): string | undefined {
  if (!isImageFile(item) || !resolvePreviewUrl) {
    return undefined
  }

  try {
    const previewUrl = resolvePreviewUrl(item, previewSize)
    const failedPreview = previewUrl
      ? failedPreviewUrls.get(item.path)
      : undefined

    if (
      failedPreview
      && failedPreview.previewUrl === previewUrl
      && Date.now() - failedPreview.failedAt < FAILED_PREVIEW_RETRY_DELAY_MS
    ) {
      return undefined
    }

    if (
      failedPreview
      && failedPreview.previewUrl === previewUrl
      && Date.now() - failedPreview.failedAt >= FAILED_PREVIEW_RETRY_DELAY_MS
    ) {
      clearPendingPreviewRetry(item.path)
      failedPreviewUrls.delete(item.path)
    }

    return previewUrl
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    void logger.error(`[FileViewer] 资源地址生成失败: ${item.path} - ${errorMessage}`)
    return undefined
  }
}

function handleImageError(itemPath: string, previewUrl?: string): void {
  if (!previewUrl) {
    return
  }

  failedPreviewUrls.set(itemPath, {
    previewUrl,
    failedAt: Date.now(),
  })
  schedulePreviewRetry(itemPath, previewUrl)
}

function scheduleHoverPreviewWarmup(item: FileViewerItem): void {
  if (!isImageFile(item) || !resolvePreviewUrl) {
    return
  }

  clearPendingHoverPreviewWarmup(item.path)

  const pendingTimer = setTimeout(() => {
    pendingHoverPreviewWarmupTimers.delete(item.path)

    const previewUrl = resolveDisplayPreviewUrl(item, HOVER_PREVIEW_SIZE)
    if (!previewUrl) {
      return
    }

    void preloadPreviewUrl(previewUrl)
    void loadFileViewerImageDimensions(item)
  }, HOVER_PREVIEW_WARMUP_DELAY_MS)

  pendingHoverPreviewWarmupTimers.set(item.path, pendingTimer)
}

function handleHoverCardOpenChange(itemPath: string, nextOpen: boolean): void {
  if (nextOpen) {
    openHoverPreviewPath = itemPath
    return
  }

  if (openHoverPreviewPath === itemPath) {
    openHoverPreviewPath = undefined
  }
}

function resolveHoverCardCloseDelay(itemPath: string): number {
  if (openHoverPreviewPath && openHoverPreviewPath !== itemPath) {
    return 0
  }

  return 120
}

function isItemHighlighted(itemPath: string): boolean {
  return highlightedItemPath === itemPath
}

const visibleItemPaths = computed(() => {
  if (viewMode === 'grid') {
    return virtualRows.flatMap(row =>
      getGridRowItems(row.index).map(item => item.path),
    )
  }

  return virtualRows
    .map(row => getListItem(row.index).path)
    .filter((path): path is string => !!path)
})

watch(() => visibleItemPaths.value, (paths) => {
  if (openHoverPreviewPath && !paths.includes(openHoverPreviewPath)) {
    openHoverPreviewPath = undefined
  }
})

function getGridRowDisplayItems(rowIndex: number): FileViewerDisplayItem[] {
  const previewSize = {
    width: gridPreviewSize,
    height: gridPreviewSize,
  }

  return getGridRowItems(rowIndex).map(item => ({
    item,
    previewUrl: resolveDisplayPreviewUrl(item, previewSize),
  }))
}

function getListRowDisplayItem(rowIndex: number): FileViewerDisplayItem {
  const item = getListItem(rowIndex)
  const previewSize = {
    width: listPreviewSize,
    height: listPreviewSize,
  }

  return {
    item,
    previewUrl: resolveDisplayPreviewUrl(item, previewSize),
  }
}

onUnmounted(() => {
  for (const pendingTimer of pendingHoverPreviewWarmupTimers.values()) {
    clearTimeout(pendingTimer)
  }

  pendingHoverPreviewWarmupTimers.clear()

  for (const pendingTimer of pendingPreviewRetryTimers.values()) {
    clearTimeout(pendingTimer)
  }

  pendingPreviewRetryTimers.clear()
})
</script>

<template>
  <div class="min-h-full w-full relative" :style="{ height: `${totalSize}px` }">
    <ContextMenu v-if="hasBackgroundContextMenu">
      <ContextMenuTrigger as-child>
        <div
          data-file-viewer-background-surface="true"
          class="inset-0 absolute"
        />
      </ContextMenuTrigger>
      <ContextMenuContent class="w-52" @close-auto-focus.prevent>
        <slot name="background-context-menu" />
      </ContextMenuContent>
    </ContextMenu>

    <div
      v-for="row in virtualRows"
      :key="String(row.key)"
      class="pointer-events-none"
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
        <FileViewerItemContextMenu
          v-for="displayItem in getGridRowDisplayItems(row.index)"
          :key="displayItem.item.path"
          :enabled="hasContextMenu"
          :item="displayItem.item"
        >
          <button
            type="button"
            data-file-viewer-item="true"
            :data-file-viewer-path="displayItem.item.path"
            :class="[
              'p-1.5 rounded-md flex flex-col gap-1 pointer-events-auto items-center focus-visible:outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring',
              isItemHighlighted(displayItem.item.path) ? 'bg-accent ring-1 ring-ring/50' : '',
            ]"
            @click="handleItemClick(displayItem.item)"
          >
            <FileViewerImageHoverCard
              :close-delay="resolveHoverCardCloseDelay(displayItem.item.path)"
              :item="displayItem.item"
              :open="openHoverPreviewPath === displayItem.item.path"
              :preview-size="HOVER_PREVIEW_SIZE"
              :resolve-preview-url="resolvePreviewUrl"
              side="top"
              @update:open="handleHoverCardOpenChange(displayItem.item.path, $event)"
            >
              <div
                class="flex shrink-0 items-center justify-center"
                :style="{ width: `${gridPreviewSize}px`, height: `${gridPreviewSize}px` }"
                @pointerenter="scheduleHoverPreviewWarmup(displayItem.item)"
                @pointerleave="clearPendingHoverPreviewWarmup(displayItem.item.path)"
              >
                <img
                  v-if="displayItem.previewUrl"
                  :alt="displayItem.item.name"
                  :src="displayItem.previewUrl"
                  class="h-full w-full object-contain"
                  decoding="async"
                  loading="lazy"
                  @error="handleImageError(displayItem.item.path, displayItem.previewUrl)"
                >
                <slot v-else name="icon" :icon-size="gridIconSize" :item="displayItem.item">
                  <component
                    :is="getDefaultIconComponent(displayItem.item)"
                    class="shrink-0"
                    :stroke-width="1.25"
                    :style="{ width: `${gridIconSize}px`, height: `${gridIconSize}px` }"
                  />
                </slot>
              </div>
            </FileViewerImageHoverCard>
            <div
              data-file-viewer-name="true"
              class="text-xs text-center break-all line-clamp-2"
              :class="{ 'text-muted-foreground': displayItem.item.isSupported === false }"
            >
              {{ displayItem.item.name }}
            </div>
          </button>
          <template v-if="hasContextMenu" #context-menu="{ item: contextMenuItem }">
            <slot name="context-menu" :item="contextMenuItem" />
          </template>
        </FileViewerItemContextMenu>
      </div>

      <template v-else>
        <!-- 使用单项 v-for 复用与网格模式一致的 displayItem 结构。 -->
        <FileViewerItemContextMenu
          v-for="displayItem in [getListRowDisplayItem(row.index)]"
          :key="displayItem.item.path"
          :enabled="hasContextMenu"
          :item="displayItem.item"
        >
          <button
            type="button"
            data-file-viewer-item="true"
            :data-file-viewer-path="displayItem.item.path"
            :class="[
              'p-2 rounded-md flex gap-2 w-full pointer-events-auto items-center focus-visible:outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring',
              isItemHighlighted(displayItem.item.path) ? 'bg-accent ring-1 ring-ring/50' : '',
            ]"
            :style="{ height: `${listItemHeight}px` }"
            @click="handleItemClick(displayItem.item)"
          >
            <div class="flex flex-1 gap-2 min-w-0 items-center">
              <FileViewerImageHoverCard
                :close-delay="resolveHoverCardCloseDelay(displayItem.item.path)"
                :item="displayItem.item"
                :open="openHoverPreviewPath === displayItem.item.path"
                :preview-size="HOVER_PREVIEW_SIZE"
                :resolve-preview-url="resolvePreviewUrl"
                side="right"
                @update:open="handleHoverCardOpenChange(displayItem.item.path, $event)"
              >
                <div
                  class="flex shrink-0 items-center justify-center"
                  :style="{ width: `${listPreviewSize}px`, height: `${listPreviewSize}px` }"
                  @pointerenter="scheduleHoverPreviewWarmup(displayItem.item)"
                  @pointerleave="clearPendingHoverPreviewWarmup(displayItem.item.path)"
                >
                  <img
                    v-if="displayItem.previewUrl"
                    :alt="displayItem.item.name"
                    :src="displayItem.previewUrl"
                    class="h-full w-full object-contain"
                    decoding="async"
                    loading="lazy"
                    @error="handleImageError(displayItem.item.path, displayItem.previewUrl)"
                  >
                  <slot v-else name="icon" :icon-size="listPreviewSize" :item="displayItem.item">
                    <component
                      :is="getDefaultIconComponent(displayItem.item)"
                      class="shrink-0"
                      :stroke-width="1.25"
                      :style="{ width: `${listPreviewSize}px`, height: `${listPreviewSize}px` }"
                    />
                  </slot>
                </div>
              </FileViewerImageHoverCard>
              <div
                data-file-viewer-name="true"
                class="text-xs text-left min-w-0 truncate"
                :class="{ 'text-muted-foreground': displayItem.item.isSupported === false }"
              >
                {{ displayItem.item.name }}
              </div>
            </div>
            <div class="text-[11px] text-muted-foreground ml-2 flex shrink-0 gap-3 [font-variant-numeric:tabular-nums] items-center" role="note">
              <div v-if="showListSize" class="text-right w-20" :aria-label="$t('common.fileMeta.size')">
                <template v-if="displayItem.item.isDir">
                  <span aria-hidden="true">--</span>
                  <span class="sr-only">{{ $t('common.fileMeta.unavailableA11y') }}</span>
                </template>
                <template v-else-if="isValidPositiveNumber(displayItem.item.size)">
                  {{ formatFileSize(displayItem.item.size!) }}
                </template>
                <template v-else>
                  <span aria-hidden="true">--</span>
                  <span class="sr-only">{{ $t('common.fileMeta.unavailableA11y') }}</span>
                </template>
              </div>
              <div v-if="showListModifiedAt" class="text-left w-32" :aria-label="$t('common.fileMeta.modifiedAt')">
                <template v-if="isValidPositiveNumber(displayItem.item.modifiedAt)">
                  {{ formatDateTime(displayItem.item.modifiedAt!) }}
                </template>
                <template v-else>
                  <span aria-hidden="true">--</span>
                  <span class="sr-only">{{ $t('common.fileMeta.unavailableA11y') }}</span>
                </template>
              </div>
              <div v-if="showListCreatedAt" class="text-left w-32" :aria-label="$t('common.fileMeta.createdAt')">
                <template v-if="isValidPositiveNumber(displayItem.item.createdAt)">
                  {{ formatDateTime(displayItem.item.createdAt!) }}
                </template>
                <template v-else>
                  <span aria-hidden="true">--</span>
                  <span class="sr-only">{{ $t('common.fileMeta.unavailableA11y') }}</span>
                </template>
              </div>
            </div>
          </button>
          <template v-if="hasContextMenu" #context-menu="{ item: contextMenuItem }">
            <slot name="context-menu" :item="contextMenuItem" />
          </template>
        </FileViewerItemContextMenu>
      </template>
    </div>
  </div>
</template>
