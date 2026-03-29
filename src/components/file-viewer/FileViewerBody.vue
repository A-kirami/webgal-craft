<script setup lang="ts">
import { File, FileImage, FileJson2, FileMusic, FileVideo, Folder } from 'lucide-vue-next'

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

const FAILED_PREVIEW_RETRY_DELAY_MS = 5000

const failedPreviewUrls = reactive(new Map<string, FailedPreviewEntry>())
const pendingPreviewRetryTimers = new Map<string, ReturnType<typeof setTimeout>>()

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

function handleItemClick(item: FileViewerItem) {
  emit('itemClick', item)
}

function clearPendingPreviewRetry(itemPath: string) {
  const pendingTimer = pendingPreviewRetryTimers.get(itemPath)
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingPreviewRetryTimers.delete(itemPath)
  }
}

function schedulePreviewRetry(itemPath: string, previewUrl: string) {
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

function handleImageError(itemPath: string, previewUrl?: string) {
  if (!previewUrl) {
    return
  }

  failedPreviewUrls.set(itemPath, {
    previewUrl,
    failedAt: Date.now(),
  })
  schedulePreviewRetry(itemPath, previewUrl)
}

onUnmounted(() => {
  for (const pendingTimer of pendingPreviewRetryTimers.values()) {
    clearTimeout(pendingTimer)
  }
  pendingPreviewRetryTimers.clear()
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
</script>

<template>
  <div :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
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
          v-for="displayItem in getGridRowDisplayItems(row.index)"
          :key="displayItem.item.path"
          type="button"
          data-file-viewer-item="true"
          class="p-1.5 rounded-md flex flex-col gap-1 items-center focus-visible:outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
          @click="handleItemClick(displayItem.item)"
        >
          <div
            class="flex shrink-0 items-center justify-center"
            :style="{ width: `${gridPreviewSize}px`, height: `${gridPreviewSize}px` }"
          >
            <img
              v-if="displayItem.previewUrl"
              :src="displayItem.previewUrl"
              :alt="displayItem.item.name"
              loading="lazy"
              decoding="async"
              class="h-full w-full object-contain"
              @error="handleImageError(displayItem.item.path, displayItem.previewUrl)"
            >
            <slot v-else name="icon" :item="displayItem.item" :icon-size="gridIconSize">
              <component
                :is="getDefaultIconComponent(displayItem.item)"
                class="shrink-0"
                :style="{ width: `${gridIconSize}px`, height: `${gridIconSize}px` }"
                :stroke-width="1.25"
              />
            </slot>
          </div>
          <div class="text-xs text-center break-all line-clamp-2" :class="{ 'text-muted-foreground': displayItem.item.isSupported === false }">
            {{ displayItem.item.name }}
          </div>
        </button>
      </div>

      <template v-else>
        <!-- Use a single-item v-for so list mode can reuse the same scoped displayItem shape as grid mode. -->
        <button
          v-for="displayItem in [getListRowDisplayItem(row.index)]"
          :key="displayItem.item.path"
          type="button"
          data-file-viewer-item="true"
          class="p-2 rounded-md flex gap-2 w-full items-center focus-visible:outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
          :style="{ height: `${listItemHeight}px` }"
          @click="handleItemClick(displayItem.item)"
        >
          <div class="flex flex-1 gap-2 min-w-0 items-center">
            <div
              class="flex shrink-0 items-center justify-center"
              :style="{ width: `${listPreviewSize}px`, height: `${listPreviewSize}px` }"
            >
              <img
                v-if="displayItem.previewUrl"
                :src="displayItem.previewUrl"
                :alt="displayItem.item.name"
                loading="lazy"
                decoding="async"
                class="h-full w-full object-contain"
                @error="handleImageError(displayItem.item.path, displayItem.previewUrl)"
              >
              <slot v-else name="icon" :item="displayItem.item" :icon-size="listPreviewSize">
                <component
                  :is="getDefaultIconComponent(displayItem.item)"
                  class="shrink-0"
                  :style="{ width: `${listPreviewSize}px`, height: `${listPreviewSize}px` }"
                  :stroke-width="1.25"
                />
              </slot>
            </div>
            <div class="text-xs text-left min-w-0 truncate" :class="{ 'text-muted-foreground': displayItem.item.isSupported === false }">
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
      </template>
    </div>
  </div>
</template>
