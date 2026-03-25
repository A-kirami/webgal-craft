<script setup lang="ts">
import { ArrowDown, ArrowUp, EllipsisVertical, LayoutGrid, LayoutList } from 'lucide-vue-next'

import { FileViewerSortBy, FileViewerSortOrder } from '~/types/file-viewer'

import type { AcceptableValue } from 'reka-ui'

type ViewMode = 'list' | 'grid'
type ZoomLevel = 'small' | 'medium' | 'large' | 'extraLarge'

interface Props {
  currentDir: string
  rootPath: string
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
  showRecentHistory,
  showSupportedOnly,
  sortBy,
  sortOrder,
  viewMode,
  zoomLevel,
} = defineProps<Props>()

const emit = defineEmits<{
  navigate: [path: string]
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
    <Button
      variant="outline"
      size="icon"
      class="size-7 hidden shadow-none sm:inline-flex"
      :title="viewMode === 'grid' ? $t('common.view.grid') : $t('common.view.list')"
      :aria-label="viewMode === 'grid' ? $t('common.view.grid') : $t('common.view.list')"
      @click="toggleViewMode"
    >
      <LayoutGrid v-if="viewMode === 'grid'" class="size-3.5" />
      <LayoutList v-else class="size-3.5" />
    </Button>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="outline" size="icon" class="size-7 shadow-none" :title="$t('filePicker.more.title')" :aria-label="$t('filePicker.more.title')">
          <EllipsisVertical class="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-30">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger class="text-xs">
            {{ $t('filePicker.more.sortTitle') }}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel class="text-xs">
              {{ $t('filePicker.more.sortFieldTitle') }}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup :model-value="sortBy" @update:model-value="updateSortByValue">
              <DropdownMenuRadioItem value="name" class="text-xs">
                {{ $t('filePicker.sort.name') }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="modifiedTime" class="text-xs">
                {{ $t('filePicker.sort.modifiedTime') }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="createdTime" class="text-xs">
                {{ $t('filePicker.sort.createdTime') }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="size" class="text-xs">
                {{ $t('filePicker.sort.size') }}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel class="text-xs">
              {{ $t('filePicker.more.sortOrderTitle') }}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup :model-value="sortOrder" @update:model-value="updateSortOrderValue">
              <DropdownMenuRadioItem value="asc" class="text-xs">
                <span class="flex-1">{{ $t('filePicker.sort.directionAsc') }}</span>
                <ArrowUp class="text-muted-foreground shrink-0 size-3.5" />
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc" class="text-xs">
                <span class="flex-1">{{ $t('filePicker.sort.directionDesc') }}</span>
                <ArrowDown class="text-muted-foreground shrink-0 size-3.5" />
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger class="text-xs">
            {{ $t('filePicker.more.zoomTitle') }}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup :model-value="zoomLevel" @update:model-value="updateZoomLevelValue">
              <DropdownMenuRadioItem value="small" class="text-xs">
                {{ $t('filePicker.zoom.small') }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="medium" class="text-xs">
                {{ $t('filePicker.zoom.medium') }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="large" class="text-xs">
                {{ $t('filePicker.zoom.large') }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="extraLarge" class="text-xs">
                {{ $t('filePicker.zoom.extraLarge') }}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger class="text-xs">
            {{ $t('filePicker.more.filtersTitle') }}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuCheckboxItem
              :model-value="showSupportedOnly"
              class="text-xs"
              @update:model-value="emit('updateShowSupportedOnly', $event === true)"
            >
              <span class="flex-1">{{ $t('filePicker.more.showSupportedOnly') }}</span>
            </DropdownMenuCheckboxItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger class="text-xs">
            {{ $t('filePicker.more.recentTitle') }}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuCheckboxItem
              :model-value="showRecentHistory"
              class="text-xs"
              @update:model-value="emit('updateShowRecentHistory', $event === true)"
            >
              <span class="flex-1">{{ $t('filePicker.more.showRecentHistory') }}</span>
            </DropdownMenuCheckboxItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
