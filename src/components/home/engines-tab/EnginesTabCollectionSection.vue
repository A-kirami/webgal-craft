<script setup lang="ts">
import { Box, Folder, Trash2 } from 'lucide-vue-next'

import { useTauriDropZone } from '~/composables/useTauriDropZone'

import type { Engine } from '~/database/model'

interface Props {
  engines: Engine[]
  getEngineProgress: (engine: Engine) => number
  hasEngineProgress: (engine: Engine) => boolean
  viewMode: 'grid' | 'list'
}

defineProps<Props>()

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

function handleImportKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }

  event.preventDefault()
  emit('importClick')
}
</script>

<template>
  <div v-if="viewMode === 'grid'" class="gap-4 grid grid-cols-1 lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2">
    <ContextMenu v-for="engine in engines" :key="engine.id">
      <ContextMenuTrigger as-child>
        <Card
          class="group rounded-lg shadow-sm transition-all duration-300 relative overflow-hidden hover:shadow"
          :class="{ 'cursor-wait': hasEngineProgress(engine) }"
        >
          <CardContent class="p-0">
            <div class="p-4 flex gap-4 items-start">
              <div class="rounded shrink-0 h-15 w-15 overflow-hidden">
                <Thumbnail
                  :path="engine.metadata.icon"
                  :alt="$t('home.engines.engineIcon', { name: engine.metadata.name })"
                  :size="128"
                  fit="cover"
                  fallback-image="/placeholder.svg"
                />
              </div>
              <div class="flex-1">
                <div class="flex items-center justify-between">
                  <h4 class="font-medium">
                    {{ engine.metadata.name }}
                  </h4>
                </div>
                <p class="text-sm text-muted-foreground mt-1">
                  {{ engine.metadata.description }}
                </p>
              </div>
            </div>
          </CardContent>
          <Progress v-if="hasEngineProgress(engine)" :model-value="getEngineProgress(engine)" class="rounded-none h-1 inset-x-0 bottom-0 absolute" />
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent class="w-42">
        <ContextMenuItem v-if="!hasEngineProgress(engine)" @click="emit('openFolder', engine)">
          <Folder class="mr-2 size-3.5" />
          {{ $t('common.openFolder') }}
        </ContextMenuItem>
        <ContextMenuItem
          v-if="!hasEngineProgress(engine)"
          class="text-destructive text-13px! focus:text-destructive-foreground focus:bg-destructive"
          @click="emit('deleteEngine', engine)"
        >
          <Trash2 class="mr-2 size-3.5" />
          {{ $t('home.engines.uninstallEngine') }}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
    <div
      ref="dropZoneGridRef"
      :aria-label="$t('home.engines.installEngine')"
      role="button"
      tabindex="0"
      class="p-4 border-1 rounded-lg border-dashed bg-gray-50 flex flex-row gap-4 cursor-pointer shadow-none transition-colors items-center justify-center overflow-hidden dark:bg-gray-900"
      :class="{
        'border-purple-300 bg-purple-50': isOverDropZoneGrid,
        'border-gray-300 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700': !isOverDropZoneGrid
      }"
      @click="emit('importClick')"
      @keydown="handleImportKeydown"
    >
      <div class="p-3 rounded-full bg-purple-100 dark:bg-purple-900/20">
        <Box class="text-purple-600 h-6 w-6 dark:text-purple-400" />
      </div>
      <div>
        <p class="text-sm font-medium">
          {{ $t('home.engines.installEngine') }}
        </p>
        <p class="text-xs text-muted-foreground mt-1">
          {{ $t('home.engines.installEngineHint') }}
        </p>
      </div>
    </div>
  </div>

  <div v-else class="border rounded-lg overflow-hidden divide-y">
    <div
      v-for="engine in engines"
      :key="engine.id"
      class="p-3 flex transition-colors duration-200 items-center justify-between relative hover:bg-primary/5 dark:hover:bg-primary/10"
      :class="{ 'cursor-wait': hasEngineProgress(engine) }"
    >
      <div class="flex gap-3 items-center">
        <div class="rounded h-10 w-10 overflow-hidden">
          <Thumbnail
            :path="engine.metadata.icon"
            :alt="$t('home.engines.engineIcon', { name: engine.metadata.name })"
            :size="128"
            fit="cover"
            fallback-image="/placeholder.svg"
          />
        </div>
        <div>
          <h3 class="font-medium">
            {{ engine.metadata.name }}
          </h3>
          <p class="text-xs text-muted-foreground">
            {{ engine.metadata.description }}
          </p>
        </div>
      </div>
      <div v-if="!hasEngineProgress(engine)" class="flex gap-2 items-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                :aria-label="$t('common.openFolder')"
                variant="ghost"
                size="icon"
                class="h-8 w-8"
                @click="emit('openFolder', engine)"
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
                @click="emit('deleteEngine', engine)"
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
      <Progress v-if="hasEngineProgress(engine)" :model-value="getEngineProgress(engine)" class="rounded-none h-0.75 inset-x-0 bottom-0 absolute" />
    </div>
    <div
      ref="dropZoneListRef"
      :aria-label="$t('home.engines.installEngine')"
      role="button"
      tabindex="0"
      class="p-3 border-t flex cursor-pointer transition-colors items-center justify-between"
      :class="{
        'bg-purple-50': isOverDropZoneList,
        'bg-gray-50/50 dark:bg-gray-800/10 hover:bg-gray-100 dark:hover:bg-gray-800/20': !isOverDropZoneList
      }"
      @click="emit('importClick')"
      @keydown="handleImportKeydown"
    >
      <div class="flex gap-3 items-center">
        <div class="rounded-md bg-purple-100 flex h-10 w-10 items-center justify-center dark:bg-purple-900/20">
          <Box class="text-purple-600 h-5 w-5 dark:text-purple-400" />
        </div>
        <div>
          <h3 class="font-medium">
            {{ $t('home.engines.installEngine') }}
          </h3>
          <p class="text-xs text-muted-foreground">
            {{ $t('home.engines.installEngineHint') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
