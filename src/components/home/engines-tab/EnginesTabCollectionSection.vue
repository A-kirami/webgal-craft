<script setup lang="ts">
import { Box } from '@lucide/vue'

import { useTauriDropZone } from '~/composables/useTauriDropZone'

import type { Engine } from '~/database/model'
import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'

interface Props {
  groups: EngineGroupCollectionItem[]
  getEngineProgress: (engine: Engine) => number | undefined
  viewMode: 'grid' | 'list'
}

const {
  groups,
  getEngineProgress,
  viewMode,
} = defineProps<Props>()

const emit = defineEmits<{
  deleteEngine: [engine: Engine]
  deleteGroup: [engineId: string]
  importClick: []
  openGroupFolder: [group: EngineGroupCollectionItem]
  drop: [paths: string[]]
  setDefaultEngine: [engineId: string | undefined]
}>()

const dropZoneGridRef = useTemplateRef<HTMLElement>('dropZoneGridRef')
const { isOverDropZone: isOverDropZoneGrid } = useTauriDropZone(dropZoneGridRef, paths => emit('drop', paths))

const dropZoneListRef = useTemplateRef<HTMLElement>('dropZoneListRef')
const { isOverDropZone: isOverDropZoneList } = useTauriDropZone(dropZoneListRef, paths => emit('drop', paths))

function getGroupProgress(group: EngineGroupCollectionItem): number | undefined {
  for (const item of group.engines) {
    const progress = getEngineProgress(item.engine)
    if (progress !== undefined) {
      return progress
    }
  }

  return undefined
}
</script>

<template>
  <div v-if="viewMode === 'grid'" class="gap-4 grid grid-cols-1 lg:grid-cols-3 md:grid-cols-2">
    <EngineGroupCard
      v-for="group in groups"
      :key="group.name"
      :group="group"
      :progress="getGroupProgress(group)"
      view-mode="grid"
      @delete-engine="emit('deleteEngine', $event)"
      @delete-group="emit('deleteGroup', $event)"
      @open-group-folder="emit('openGroupFolder', $event)"
      @set-default-engine="emit('setDefaultEngine', $event)"
    />

    <button
      ref="dropZoneGridRef"
      type="button"
      :aria-label="$t('home.engines.installEngine')"
      class="p-4 border-1 rounded-lg border-dashed flex gap-4 cursor-pointer shadow-none transition-colors items-center justify-center overflow-hidden hover:border-primary/40 dark:hover:border-primary/60"
      :class="{
        'border-primary/40 bg-primary/5': isOverDropZoneGrid,
        'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900': !isOverDropZoneGrid,
      }"
      @click="emit('importClick')"
    >
      <div class="p-3 rounded-full bg-primary/10">
        <Box class="text-primary h-6 w-6" />
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
    <EngineGroupCard
      v-for="group in groups"
      :key="group.name"
      :group="group"
      :progress="getGroupProgress(group)"
      view-mode="list"
      @delete-engine="emit('deleteEngine', $event)"
      @delete-group="emit('deleteGroup', $event)"
      @open-group-folder="emit('openGroupFolder', $event)"
      @set-default-engine="emit('setDefaultEngine', $event)"
    />

    <button
      ref="dropZoneListRef"
      type="button"
      :aria-label="$t('home.engines.installEngine')"
      class="p-3 flex w-full cursor-pointer transition-colors items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800/20"
      :class="{
        'bg-primary/5': isOverDropZoneList,
        'bg-gray-50/50 dark:bg-gray-800/10': !isOverDropZoneList,
      }"
      @click="emit('importClick')"
    >
      <div class="flex gap-3 items-center">
        <div class="rounded-md bg-primary/10 flex h-10 w-10 items-center justify-center">
          <Box class="text-primary h-5 w-5" />
        </div>
        <div class="text-left">
          <p class="text-sm font-medium">
            {{ $t('home.engines.installEngine') }}
          </p>
          <p class="text-xs text-muted-foreground mt-1">
            {{ $t('home.engines.installEngineHint') }}
          </p>
        </div>
      </div>
    </button>
  </div>
</template>
