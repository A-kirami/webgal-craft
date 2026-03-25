<script setup lang="ts">
import { File, FileImage, FileJson2, FileMusic, FileVideo, Folder } from 'lucide-vue-next'

import { formatFileSize } from '~/utils/format'
import { isValidPositiveNumber } from '~/utils/sort'

import type { FileViewerItem, FileViewerVirtualRow } from '~/types/file-viewer'

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
} = defineProps<FileViewerBodyProps>()

const emit = defineEmits<{
  itemClick: [item: FileViewerItem]
}>()

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

function getListRowItem(rowIndex: number): FileViewerItem {
  return getListItem(rowIndex)
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
          v-for="item in getGridRowItems(row.index)"
          :key="item.path"
          type="button"
          data-file-viewer-item="true"
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
              :size="gridPreviewSize"
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
        v-else
        :key="getListRowItem(row.index).path"
        type="button"
        data-file-viewer-item="true"
        class="p-2 rounded-md flex gap-2 w-full items-center focus-visible:outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
        :style="{ height: `${listItemHeight}px` }"
        @click="handleItemClick(getListRowItem(row.index))"
      >
        <div class="flex flex-1 gap-2 min-w-0 items-center">
          <div
            class="flex shrink-0 items-center justify-center"
            :style="{ width: `${listPreviewSize}px`, height: `${listPreviewSize}px` }"
          >
            <Thumbnail
              v-if="isImageFile(getListRowItem(row.index))"
              :path="getListRowItem(row.index).path"
              :size="listPreviewSize"
              :alt="getListRowItem(row.index).name"
              fit="contain"
            />
            <slot v-else name="icon" :item="getListRowItem(row.index)" :icon-size="listPreviewSize">
              <component
                :is="getDefaultIconComponent(getListRowItem(row.index))"
                class="shrink-0"
                :style="{ width: `${listPreviewSize}px`, height: `${listPreviewSize}px` }"
                :stroke-width="1.25"
              />
            </slot>
          </div>
          <div class="text-xs text-left min-w-0 truncate" :class="{ 'text-muted-foreground': getListRowItem(row.index).isSupported === false }">
            {{ getListRowItem(row.index).name }}
          </div>
        </div>
        <div class="text-[11px] text-muted-foreground ml-2 flex shrink-0 gap-3 [font-variant-numeric:tabular-nums] items-center" role="note">
          <div v-if="showListSize" class="text-right w-20" :aria-label="$t('common.fileMeta.size')">
            <template v-if="getListRowItem(row.index).isDir">
              <span aria-hidden="true">--</span>
              <span class="sr-only">{{ $t('common.fileMeta.unavailableA11y') }}</span>
            </template>
            <template v-else-if="isValidPositiveNumber(getListRowItem(row.index).size)">
              {{ formatFileSize(getListRowItem(row.index).size!) }}
            </template>
            <template v-else>
              <span aria-hidden="true">--</span>
              <span class="sr-only">{{ $t('common.fileMeta.unavailableA11y') }}</span>
            </template>
          </div>
          <div v-if="showListModifiedAt" class="text-left w-32" :aria-label="$t('common.fileMeta.modifiedAt')">
            <template v-if="isValidPositiveNumber(getListRowItem(row.index).modifiedAt)">
              {{ formatDateTime(getListRowItem(row.index).modifiedAt!) }}
            </template>
            <template v-else>
              <span aria-hidden="true">--</span>
              <span class="sr-only">{{ $t('common.fileMeta.unavailableA11y') }}</span>
            </template>
          </div>
          <div v-if="showListCreatedAt" class="text-left w-32" :aria-label="$t('common.fileMeta.createdAt')">
            <template v-if="isValidPositiveNumber(getListRowItem(row.index).createdAt)">
              {{ formatDateTime(getListRowItem(row.index).createdAt!) }}
            </template>
            <template v-else>
              <span aria-hidden="true">--</span>
              <span class="sr-only">{{ $t('common.fileMeta.unavailableA11y') }}</span>
            </template>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>
