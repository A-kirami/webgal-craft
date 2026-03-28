<script setup lang="ts">
import { ArrowDown, ArrowUp, ArrowUpDown, Blend, Check, Image, LayoutGrid, LayoutList, LayoutTemplate, MicVocal, Minus, Music, Plus, Search, UserRound, Video } from 'lucide-vue-next'

import { usePreferenceStore } from '~/stores/preference'
import { FileViewerSortBy, FileViewerSortOrder } from '~/types/file-viewer'

const preferenceStore = usePreferenceStore()

const { t } = useI18n()

const assetTabItems = $computed(() => [
  { tab: 'figure', icon: UserRound, label: t('edit.assetPanel.tabs.figure') },
  { tab: 'background', icon: Image, label: t('edit.assetPanel.tabs.background') },
  { tab: 'bgm', icon: Music, label: t('edit.assetPanel.tabs.bgm') },
  { tab: 'vocal', icon: MicVocal, label: t('edit.assetPanel.tabs.vocal') },
  { tab: 'video', icon: Video, label: t('edit.assetPanel.tabs.video') },
  { tab: 'animation', icon: Blend, label: t('edit.assetPanel.tabs.animation') },
  { tab: 'template', icon: LayoutTemplate, label: t('edit.assetPanel.tabs.template') },
])

let isSearchExpanded = $ref(false)

const assetPaths = $ref<Record<string, string>>({})
const assetSearchQueries = $ref<Record<string, string>>({})

const currentPath = $computed({
  get: () => assetPaths[preferenceStore.assetTab] || '',
  set: (val: string) => {
    assetPaths[preferenceStore.assetTab] = val
  },
})

let currentSearchQuery = $computed({
  get: () => assetSearchQueries[preferenceStore.assetTab] || '',
  set: (val: string) => {
    assetSearchQueries[preferenceStore.assetTab] = val
  },
})

const sortOptions = $computed(() => [
  { value: 'name', label: t('edit.assetPanel.sort.name') },
  { value: 'modifiedTime', label: t('edit.assetPanel.sort.modifiedTime') },
  { value: 'createdTime', label: t('edit.assetPanel.sort.createdTime') },
  { value: 'size', label: t('edit.assetPanel.sort.size') },
] as const satisfies { value: FileViewerSortBy, label: string }[])

const currentSortLabel = $computed(() =>
  sortOptions.find(option => option.value === preferenceStore.assetSortBy)?.label ?? sortOptions[0]?.label ?? '',
)

const isSortAsc = $computed(() => preferenceStore.assetSortOrder === 'asc')
let assetViewModeModel = $computed({
  get: () => preferenceStore.assetViewMode,
  set: (val: 'grid' | 'list' | undefined) => {
    if (val === 'grid' || val === 'list') {
      preferenceStore.assetViewMode = val
    }
  },
})

function toggleSearch() {
  if (isSearchExpanded) {
    currentSearchQuery = ''
  }
  isSearchExpanded = !isSearchExpanded
}

function handleSortFieldSelect(sortBy: FileViewerSortBy) {
  if (preferenceStore.assetSortBy === sortBy) {
    toggleSortOrder()
    return
  }
  preferenceStore.assetSortBy = sortBy
}

function toggleSortOrder() {
  preferenceStore.assetSortOrder = preferenceStore.assetSortOrder === 'asc' ? 'desc' : 'asc'
}

function handleSortOrderUpdate(sortOrder: FileViewerSortOrder) {
  preferenceStore.assetSortOrder = sortOrder
}

function handleZoomChange(delta: number) {
  const newZoom = preferenceStore.assetZoom[0] + delta
  if (newZoom >= 50 && newZoom <= 150) {
    preferenceStore.assetZoom[0] = newZoom
  }
}

function resetZoom() {
  preferenceStore.assetZoom[0] = 100
}

const isMinZoom = $computed(() => preferenceStore.assetZoom[0] <= 50)
const isMaxZoom = $computed(() => preferenceStore.assetZoom[0] >= 150)
</script>

<template>
  <div class="flex h-full">
    <ScrollArea>
      <Tabs ::="preferenceStore.assetTab" orientation="vertical" class="flex h-full">
        <TabsList class="p-0.5 border-r rounded-none bg-transparent flex-col gap-0.5 h-full justify-start">
          <TooltipProvider :delay-duration="0">
            <Tooltip v-for="item in assetTabItems" :key="item.tab">
              <TooltipTrigger as-child>
                <span>
                  <TabsTrigger
                    :value="item.tab"
                    class="p-1.75 data-[state=active]:bg-accent data-[state=active]:shadow-none"
                  >
                    <component :is="item.icon" class="size-4.5" />
                  </TabsTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" class="text-xs px-2 py-1">
                {{ item.label }}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TabsList>
      </Tabs>
    </ScrollArea>
    <div class="flex flex-1 flex-col">
      <div class="px-3 py-1 border-b @container flex gap-2 min-w-0 items-center justify-between">
        <AssetBreadcrumb
          class="flex-1 min-w-0"
          :asset-type="preferenceStore.assetTab"
          :current-path="currentPath"
          @update:current-path="currentPath = $event"
        />
        <div class="flex gap-1.5 items-center">
          <Input
            ::="currentSearchQuery"
            type="search"
            :placeholder="$t('edit.assetPanel.searchPlaceholder')"
            :aria-label="$t('edit.assetPanel.searchPlaceholder')"
            class="text-xs h-7 shadow-none transition-all duration-200 ease-out"
            :class="[
              isSearchExpanded ? 'w-44 opacity-100 px-2' : 'w-0 opacity-0 px-0 border-transparent pointer-events-none'
            ]"
          />
          <Button
            :variant="isSearchExpanded ? 'default' : 'outline'"
            size="icon"
            class="shrink-0 size-7 shadow-none"
            :title="$t('edit.assetPanel.actions.toggleSearch')"
            :aria-label="$t('edit.assetPanel.actions.toggleSearch')"
            @click="toggleSearch"
          >
            <Search class="size-3.5" />
          </Button>
        </div>
      </div>
      <KeepAlive>
        <AssetView
          :key="preferenceStore.assetTab"
          class="flex-1 min-h-0"
          :asset-type="preferenceStore.assetTab"
          :search-query="currentSearchQuery"
          :sort-by="preferenceStore.assetSortBy"
          :sort-order="preferenceStore.assetSortOrder"
          :current-path="currentPath"
          @update:current-path="currentPath = $event"
          @update:sort-by="handleSortFieldSelect"
          @update:sort-order="handleSortOrderUpdate"
        />
      </KeepAlive>
      <div class="px-2 py-0.75 border-t bg-muted/35 @container flex gap-2 items-center justify-between">
        <div class="flex gap-1.5 min-w-0 items-center">
          <ToggleGroup
            v-model="assetViewModeModel"
            type="single"
            class="border rounded gap-0"
          >
            <ToggleGroupItem
              value="grid"
              size="sm"
              class="p-0 rounded-sm size-6 min-w-auto data-[state=on]:bg-gray-200 dark:data-[state=on]:bg-gray-800"
              :title="$t('edit.assetPanel.actions.viewGrid')"
              :aria-label="$t('edit.assetPanel.actions.viewGrid')"
            >
              <LayoutGrid class="size-3.5!" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="list"
              size="sm"
              class="p-0 rounded-sm size-6 min-w-auto data-[state=on]:bg-gray-200 dark:data-[state=on]:bg-gray-800"
              :title="$t('edit.assetPanel.actions.viewList')"
              :aria-label="$t('edit.assetPanel.actions.viewList')"
            >
              <LayoutList class="size-3.5!" />
            </ToggleGroupItem>
          </ToggleGroup>
          <div class="border rounded inline-flex min-w-0 items-center">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="ghost"
                  size="sm"
                  class="text-xs px-2 gap-1.5 h-6 max-w-36 min-w-0 shadow-none"
                  :title="$t('edit.assetPanel.actions.sortField')"
                >
                  <ArrowUpDown class="text-muted-foreground shrink-0 size-3.5" />
                  <span class="hidden truncate @[500px]:inline">{{ currentSortLabel }}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class="min-w-34">
                <DropdownMenuLabel class="text-xs">
                  {{ $t('edit.assetPanel.sort.by') }}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  v-for="option in sortOptions"
                  :key="option.value"
                  class="text-xs gap-2"
                  @select="() => handleSortFieldSelect(option.value)"
                >
                  <span class="flex-1">{{ option.label }}</span>
                  <Check v-if="preferenceStore.assetSortBy === option.value" class="size-3.5" />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              class="size-6 shadow-none"
              :title="$t('edit.assetPanel.actions.sortOrder')"
              :aria-label="$t('edit.assetPanel.actions.sortOrder')"
              @click="toggleSortOrder"
            >
              <ArrowUp v-if="isSortAsc" class="size-3.5" />
              <ArrowDown v-else class="size-3.5" />
              <span class="sr-only">
                {{ isSortAsc ? $t('edit.assetPanel.sort.directionAsc') : $t('edit.assetPanel.sort.directionDesc') }}
              </span>
            </Button>
          </div>
        </div>
        <div class="inline-flex gap-0.5 items-center">
          <Button
            variant="ghost"
            size="icon"
            class="size-6"
            :disabled="isMinZoom"
            :title="$t('edit.assetPanel.actions.zoomOut')"
            :aria-label="$t('edit.assetPanel.actions.zoomOut')"
            @click="handleZoomChange(-5)"
          >
            <Minus class="size-3.5" />
          </Button>
          <Slider
            ::="preferenceStore.assetZoom"
            :min="50"
            :max="150"
            :step="5"
            class="w-18 hidden @[320px]:flex @[520px]:w-28 @[760px]:w-36"
          />
          <Button
            variant="ghost"
            size="sm"
            class="text-xs px-1.5 h-6 min-w-10 tabular-nums"
            :title="$t('edit.assetPanel.actions.zoomReset')"
            :aria-label="$t('edit.assetPanel.actions.zoomReset')"
            @click="resetZoom"
          >
            {{ preferenceStore.assetZoom[0] }}%
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-6"
            :disabled="isMaxZoom"
            :title="$t('edit.assetPanel.actions.zoomIn')"
            :aria-label="$t('edit.assetPanel.actions.zoomIn')"
            @click="handleZoomChange(5)"
          >
            <Plus class="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
