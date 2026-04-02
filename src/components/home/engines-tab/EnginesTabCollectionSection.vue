<script setup lang="ts">
import { Box, Folder, Trash2 } from '@lucide/vue'

import AssetImage from '~/components/shared/AssetImage.vue'
import { useTauriDropZone } from '~/composables/useTauriDropZone'

import type { Engine } from '~/database/model'
import type { EngineCollectionItem } from '~/features/home/home-collection-items'
import type { AssetThumbnailOptions } from '~/services/platform/asset-url'

interface Props {
  items: EngineCollectionItem[]
  getEngineProgress: (engine: Engine) => number
  hasEngineProgress: (engine: Engine) => boolean
  viewMode: 'grid' | 'list'
}

const {
  items,
  getEngineProgress,
  hasEngineProgress,
  viewMode,
} = defineProps<Props>()

const emit = defineEmits<{
  deleteEngine: [engine: Engine]
  importClick: []
  openFolder: [engine: Engine]
  drop: [paths: string[]]
}>()

const dropZoneGridRef = useTemplateRef<HTMLElement>('dropZoneGridRef')
const { isOverDropZone: isOverDropZoneGrid } = useTauriDropZone(dropZoneGridRef, paths => emit('drop', paths))

const dropZoneListRef = useTemplateRef<HTMLElement>('dropZoneListRef')
const { isOverDropZone: isOverDropZoneList } = useTauriDropZone(dropZoneListRef, paths => emit('drop', paths))

const GRID_ICON_THUMBNAIL: AssetThumbnailOptions = {
  width: 120,
  height: 120,
  resizeMode: 'cover',
}

const LIST_ICON_THUMBNAIL: AssetThumbnailOptions = {
  width: 80,
  height: 80,
  resizeMode: 'cover',
}
</script>

<template>
  <div v-if="viewMode === 'grid'" class="gap-4 grid grid-cols-1 lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2">
    <ContextMenu v-for="item in items" :key="item.engine.id">
      <ContextMenuTrigger as-child>
        <Card
          class="group rounded-lg shadow-sm transition-all duration-300 relative overflow-hidden hover:shadow"
          :class="{ 'cursor-wait': hasEngineProgress(item.engine) }"
        >
          <CardContent class="p-0">
            <div class="p-4 flex gap-4 items-start">
              <div class="rounded shrink-0 h-15 w-15 overflow-hidden">
                <AssetImage
                  :path="item.engine.previewAssets.icon.path"
                  :root-path="item.engine.path"
                  :serve-url="item.serveUrl"
                  :alt="$t('home.engines.engineIcon', { name: item.engine.metadata.name })"
                  :cache-version="item.engine.previewAssets.icon.cacheVersion"
                  object-fit="cover"
                  fallback-image="/placeholder.svg"
                  :thumbnail="GRID_ICON_THUMBNAIL"
                  class="h-full w-full"
                />
              </div>
              <div class="flex-1">
                <div class="flex items-center justify-between">
                  <h4 class="font-medium">
                    {{ item.engine.metadata.name }}
                  </h4>
                </div>
                <p class="text-sm text-muted-foreground mt-1">
                  {{ item.engine.metadata.description }}
                </p>
              </div>
            </div>
          </CardContent>
          <Progress v-if="hasEngineProgress(item.engine)" :model-value="getEngineProgress(item.engine)" class="rounded-none h-1 inset-x-0 bottom-0 absolute" />
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent class="w-42">
        <ContextMenuItem v-if="!hasEngineProgress(item.engine)" @click="emit('openFolder', item.engine)">
          <Folder class="mr-2 size-3.5" />
          {{ $t('common.openFolder') }}
        </ContextMenuItem>
        <ContextMenuItem
          v-if="!hasEngineProgress(item.engine)"
          class="text-destructive text-13px! focus:text-destructive-foreground focus:bg-destructive"
          @click="emit('deleteEngine', item.engine)"
        >
          <Trash2 class="mr-2 size-3.5" />
          {{ $t('home.engines.uninstallEngine') }}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
    <button
      ref="dropZoneGridRef"
      type="button"
      :aria-label="$t('home.engines.installEngine')"
      class="p-4 border-1 border-gray-300 rounded-lg border-dashed bg-gray-50 flex flex-row gap-4 cursor-pointer shadow-none transition-colors items-center justify-center overflow-hidden dark:border-gray-700 hover:border-purple-300 dark:bg-gray-900 dark:hover:border-purple-700"
      :class="{'border-purple-300 bg-purple-50': isOverDropZoneGrid}"
      @click="emit('importClick')"
    >
      <div class="p-3 rounded-full bg-purple-100 dark:bg-purple-900/20">
        <Box class="text-purple-600 h-6 w-6 dark:text-purple-400" />
      </div>
      <div class="text-left">
        <p class="text-sm font-medium">
          {{ $t('home.engines.installEngine') }}
        </p>
        <p class="text-xs text-muted-foreground mt-1">
          {{ $t('home.engines.installEngineHint') }}
        </p>
      </div>
    </button>
  </div>
  <div v-else class="border rounded-lg overflow-hidden divide-y">
    <div
      v-for="item in items"
      :key="item.engine.id"
      class="p-3 flex transition-colors duration-200 items-center justify-between relative hover:bg-primary/5 dark:hover:bg-primary/10"
      :class="{ 'cursor-wait': hasEngineProgress(item.engine) }"
    >
      <div class="flex gap-3 items-center">
        <div class="rounded h-10 w-10 overflow-hidden">
          <AssetImage
            :path="item.engine.previewAssets.icon.path"
            :root-path="item.engine.path"
            :serve-url="item.serveUrl"
            :alt="$t('home.engines.engineIcon', { name: item.engine.metadata.name })"
            :cache-version="item.engine.previewAssets.icon.cacheVersion"
            object-fit="cover"
            fallback-image="/placeholder.svg"
            :thumbnail="LIST_ICON_THUMBNAIL"
            class="h-full w-full"
          />
        </div>
        <div>
          <h3 class="font-medium">
            {{ item.engine.metadata.name }}
          </h3>
          <p class="text-xs text-muted-foreground">
            {{ item.engine.metadata.description }}
          </p>
        </div>
      </div>
      <div v-if="!hasEngineProgress(item.engine)" class="flex gap-2 items-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                :aria-label="$t('common.openFolder')"
                variant="ghost"
                size="icon"
                class="h-8 w-8"
                @click="emit('openFolder', item.engine)"
              >
                <Folder class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ $t('common.openFolder') }}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                :aria-label="$t('home.engines.uninstallEngine')"
                variant="ghost"
                size="icon"
                class="text-destructive h-8 w-8 hover:text-destructive-foreground hover:bg-destructive"
                @click="emit('deleteEngine', item.engine)"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ $t('home.engines.uninstallEngine') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Progress v-if="hasEngineProgress(item.engine)" :model-value="getEngineProgress(item.engine)" class="rounded-none h-0.75 inset-x-0 bottom-0 absolute" />
    </div>
    <button
      ref="dropZoneListRef"
      type="button"
      :aria-label="$t('home.engines.installEngine')"
      class="p-3 bg-gray-50/50 flex cursor-pointer transition-colors items-center justify-between dark:bg-gray-800/10 hover:bg-gray-100 dark:hover:bg-gray-800/20"
      :class="{'bg-purple-50': isOverDropZoneList}"
      @click="emit('importClick')"
    >
      <div class="flex gap-3 items-center">
        <div class="rounded-md bg-purple-100 flex h-10 w-10 items-center justify-center dark:bg-purple-900/20">
          <Box class="text-purple-600 h-5 w-5 dark:text-purple-400" />
        </div>
        <div class="text-left">
          <h3 class="font-medium">
            {{ $t('home.engines.installEngine') }}
          </h3>
          <p class="text-xs text-muted-foreground">
            {{ $t('home.engines.installEngineHint') }}
          </p>
        </div>
      </div>
    </button>
  </div>
</template>
