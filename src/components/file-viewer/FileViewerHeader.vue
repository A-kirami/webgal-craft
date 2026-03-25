<script setup lang="ts">
import { ArrowDown, ArrowUp } from 'lucide-vue-next'

import { FileViewerSortBy, FileViewerSortOrder } from '~/types/file-viewer'

interface FileViewerHeaderProps {
  listPreviewSize: number
  showListSize: boolean
  showListModifiedAt: boolean
  showListCreatedAt: boolean
  sortBy: FileViewerSortBy
  sortOrder: FileViewerSortOrder
  sortableHeaders: boolean
}

const {
  listPreviewSize,
  showListSize,
  showListModifiedAt,
  showListCreatedAt,
  sortBy,
  sortOrder,
  sortableHeaders,
} = defineProps<FileViewerHeaderProps>()

const emit = defineEmits<{
  'update:sortBy': [sortBy: FileViewerSortBy]
  'update:sortOrder': [sortOrder: FileViewerSortOrder]
}>()

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
  if (!sortableHeaders) {
    return
  }

  if (sortBy === field) {
    emit('update:sortOrder', sortOrder === 'asc' ? 'desc' : 'asc')
    return
  }

  emit('update:sortBy', field)
}

function getHeaderInteractionClass(): string {
  return sortableHeaders
    ? 'cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
    : 'cursor-default'
}
</script>

<template>
  <div
    class="px-2 border-b bg-background/95 flex items-center backdrop-blur-sm"
    style="height: 26px;"
  >
    <div class="flex flex-1 gap-2 min-w-0 items-center">
      <div aria-hidden="true" :style="{ width: `${listPreviewSize}px` }" />
      <div class="contents" role="columnheader" :aria-sort="getHeaderAriaSort('name')">
        <button
          type="button"
          :tabindex="sortableHeaders ? 0 : -1"
          :aria-disabled="!sortableHeaders"
          class="text-[11px] text-left rounded-sm inline-flex gap-1 min-w-0 truncate items-center"
          :class="[getHeaderInteractionClass(), { 'text-foreground font-medium': isSortColumn('name'), 'text-muted-foreground': !isSortColumn('name') }]"
          @click="handleSortHeaderClick('name')"
        >
          <span>{{ $t('edit.assetPanel.sort.name') }}</span>
          <ArrowUp v-if="isSortColumn('name') && sortOrder === 'asc'" class="size-3" />
          <ArrowDown v-else-if="isSortColumn('name') && sortOrder === 'desc'" class="size-3" />
        </button>
      </div>
    </div>
    <div class="text-[11px] ml-2 flex shrink-0 gap-3 items-center">
      <div v-if="showListSize" class="contents" role="columnheader" :aria-sort="getHeaderAriaSort('size')">
        <button
          type="button"
          :tabindex="sortableHeaders ? 0 : -1"
          :aria-disabled="!sortableHeaders"
          class="text-right inline-flex gap-1 w-20 items-center justify-end"
          :class="[getHeaderInteractionClass(), { 'text-foreground font-medium': isSortColumn('size'), 'text-muted-foreground': !isSortColumn('size') }]"
          @click="handleSortHeaderClick('size')"
        >
          <span>{{ $t('common.fileMeta.size') }}</span>
          <ArrowUp v-if="isSortColumn('size') && sortOrder === 'asc'" class="size-3" />
          <ArrowDown v-else-if="isSortColumn('size') && sortOrder === 'desc'" class="size-3" />
        </button>
      </div>
      <div v-if="showListModifiedAt" class="contents" role="columnheader" :aria-sort="getHeaderAriaSort('modifiedTime')">
        <button
          type="button"
          :tabindex="sortableHeaders ? 0 : -1"
          :aria-disabled="!sortableHeaders"
          class="text-left inline-flex gap-1 w-32 items-center"
          :class="[getHeaderInteractionClass(), { 'text-foreground font-medium': isSortColumn('modifiedTime'), 'text-muted-foreground': !isSortColumn('modifiedTime') }]"
          @click="handleSortHeaderClick('modifiedTime')"
        >
          <span>{{ $t('common.fileMeta.modifiedAt') }}</span>
          <ArrowUp v-if="isSortColumn('modifiedTime') && sortOrder === 'asc'" class="size-3" />
          <ArrowDown v-else-if="isSortColumn('modifiedTime') && sortOrder === 'desc'" class="size-3" />
        </button>
      </div>
      <div v-if="showListCreatedAt" class="contents" role="columnheader" :aria-sort="getHeaderAriaSort('createdTime')">
        <button
          type="button"
          :tabindex="sortableHeaders ? 0 : -1"
          :aria-disabled="!sortableHeaders"
          class="text-left inline-flex gap-1 w-32 items-center"
          :class="[getHeaderInteractionClass(), { 'text-foreground font-medium': isSortColumn('createdTime'), 'text-muted-foreground': !isSortColumn('createdTime') }]"
          @click="handleSortHeaderClick('createdTime')"
        >
          <span>{{ $t('common.fileMeta.createdAt') }}</span>
          <ArrowUp v-if="isSortColumn('createdTime') && sortOrder === 'asc'" class="size-3" />
          <ArrowDown v-else-if="isSortColumn('createdTime') && sortOrder === 'desc'" class="size-3" />
        </button>
      </div>
    </div>
  </div>
</template>
