<script setup lang="ts">
import { EllipsisVertical, LayoutGrid, LayoutList } from '@lucide/vue'

import { FileViewerSortBy, FileViewerSortOrder } from '~/types/file-viewer'

import type { AcceptableValue } from 'reka-ui'

type ViewMode = 'list' | 'grid'
type ZoomLevel = 'small' | 'medium' | 'large' | 'extraLarge'

interface Props {
  currentDir: string
  rootPath: string
  searchQuery: string
  showRecentHistory: boolean
  showSupportedOnly: boolean
  sortBy: FileViewerSortBy
  sortOrder: FileViewerSortOrder
  viewMode: ViewMode
  zoomLevel: ZoomLevel
}

const {
  currentDir,
  rootPath,
  searchQuery,
  showRecentHistory,
  showSupportedOnly,
  sortBy,
  sortOrder,
  viewMode,
  zoomLevel,
} = defineProps<Props>()

const emit = defineEmits<{
  navigate: [path: string]
  updateSearchQuery: [value: string]
  updateShowRecentHistory: [value: boolean]
  updateShowSupportedOnly: [value: boolean]
  updateSortBy: [value: FileViewerSortBy]
  updateSortOrder: [value: FileViewerSortOrder]
  updateViewMode: [value: ViewMode]
  updateZoomLevel: [value: ZoomLevel]
}>()

function toggleViewMode() {
  emit('updateViewMode', viewMode === 'grid' ? 'list' : 'grid')
}

function updateSortByValue(value: AcceptableValue) {
  if (typeof value === 'string') {
    emit('updateSortBy', value as FileViewerSortBy)
  }
}

function updateSortOrderValue(value: AcceptableValue) {
  if (typeof value === 'string') {
    emit('updateSortOrder', value as FileViewerSortOrder)
  }
}

function updateZoomLevelValue(value: AcceptableValue) {
  if (typeof value === 'string') {
    emit('updateZoomLevel', value as ZoomLevel)
  }
}
</script>

<template>
  <div class="px-2 py-1 border-b flex gap-1.5 min-w-0 items-center">
    <PathBreadcrumb
      class="ml-1 flex-1 min-w-0"
      :root-path="rootPath"
      :current-path="currentDir"
      @navigate="emit('navigate', $event)"
    />
    <ExpandableSearchInput
      :model-value="searchQuery"
      expanded-width-class="w-40"
      @update:model-value="emit('updateSearchQuery', $event)"
    />
    <Button
      variant="outline"
      size="icon-sm"
      class="hidden sm:inline-flex"
      :title="viewMode === 'grid' ? $t('common.view.grid') : $t('common.view.list')"
      :aria-label="viewMode === 'grid' ? $t('common.view.grid') : $t('common.view.list')"
      @click="toggleViewMode"
    >
      <LayoutGrid v-if="viewMode === 'grid'" />
      <LayoutList v-else />
    </Button>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="outline" size="icon-sm" :title="$t('filePicker.more.title')" :aria-label="$t('filePicker.more.title')">
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {{ $t('filePicker.more.sortTitle') }}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>
              {{ $t('filePicker.more.sortFieldTitle') }}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup :model-value="sortBy" @update:model-value="updateSortByValue">
              <DropdownMenuRadioItem value="name">
                {{ $t('filePicker.sort.name') }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="modifiedTime">
                {{ $t('filePicker.sort.modifiedTime') }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="createdTime">
                {{ $t('filePicker.sort.createdTime') }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="size">
                {{ $t('filePicker.sort.size') }}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>
              {{ $t('filePicker.more.sortOrderTitle') }}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup :model-value="sortOrder" @update:model-value="updateSortOrderValue">
              <DropdownMenuRadioItem value="asc">
                {{ $t('filePicker.sort.directionAsc') }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc">
                {{ $t('filePicker.sort.directionDesc') }}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {{ $t('filePicker.more.zoomTitle') }}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup :model-value="zoomLevel" @update:model-value="updateZoomLevelValue">
              <DropdownMenuRadioItem value="small">
                {{ $t('filePicker.zoom.small') }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="medium">
                {{ $t('filePicker.zoom.medium') }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="large">
                {{ $t('filePicker.zoom.large') }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="extraLarge">
                {{ $t('filePicker.zoom.extraLarge') }}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {{ $t('filePicker.more.filtersTitle') }}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuCheckboxItem
              :model-value="showSupportedOnly"
              @update:model-value="emit('updateShowSupportedOnly', $event === true)"
            >
              {{ $t('filePicker.more.showSupportedOnly') }}
            </DropdownMenuCheckboxItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {{ $t('filePicker.more.recentTitle') }}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuCheckboxItem
              :model-value="showRecentHistory"
              @update:model-value="emit('updateShowRecentHistory', $event === true)"
            >
              {{ $t('filePicker.more.showRecentHistory') }}
            </DropdownMenuCheckboxItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
