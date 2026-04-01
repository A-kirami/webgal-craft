<script setup lang="ts">
import { Box, Download, Plus } from 'lucide-vue-next'

import { useTauriDropZone } from '~/composables/useTauriDropZone'
import { useEnginesTabController } from '~/features/home/engines-tab/useEnginesTabController'
import { useModalStore } from '~/stores/modal'
import { usePreferenceStore } from '~/stores/preference'
import { usePreviewRuntimeStore } from '~/stores/preview-runtime'
import { useResourceStore } from '~/stores/resource'

import EnginesTabCollectionSection from './EnginesTabCollectionSection.vue'

import type { EngineCollectionItem } from '~/features/home/home-collection-items'

const modalStore = useModalStore()
const preferenceStore = usePreferenceStore()
const previewRuntimeStore = usePreviewRuntimeStore()
const resourceStore = useResourceStore()
const { t } = useI18n()

const engineCollectionItems = computed<EngineCollectionItem[]>(() =>
  resourceStore.filteredEngines.map(engine => ({
    engine,
    serveUrl: previewRuntimeStore.getServeUrl(engine.path),
  })),
)
const controller = useEnginesTabController({
  activeProgress: resourceStore.activeProgress,
  openDeleteEngineModal: engine => modalStore.open('DeleteEngineModal', { engine }),
  t,
})
const dropZoneEmptyRef = useTemplateRef<HTMLElement>('dropZoneEmptyRef')
const { isOverDropZone: isOverDropZoneEmpty } = useTauriDropZone(dropZoneEmptyRef, paths => controller.handleDrop(paths))
</script>

<template>
  <EnginesTabCollectionSection
    v-if="engineCollectionItems.length > 0"
    :items="engineCollectionItems"
    :view-mode="preferenceStore.viewMode"
    :get-engine-progress="controller.getEngineProgress"
    :has-engine-progress="controller.hasEngineProgress"
    @delete-engine="controller.handleDelete"
    @drop="controller.handleDrop"
    @import-click="controller.selectEngineFolder"
    @open-folder="controller.handleOpenFolder"
  />
  <div
    v-else
    ref="dropZoneEmptyRef"
    class="py-12 border rounded-lg border-dashed flex flex-col transition-colors items-center justify-center"
    :class="{
      'border-primary/50 bg-primary/5': isOverDropZoneEmpty,
      'border-gray-300 dark:border-gray-700': !isOverDropZoneEmpty
    }"
  >
    <div class="mb-4 p-4 rounded-full bg-gray-100 dark:bg-gray-800">
      <Box class="text-muted-foreground h-10 w-10" />
    </div>
    <h3 class="text-lg font-medium mb-1">
      {{ $t('home.engines.noEngines') }}
    </h3>
    <p class="text-sm text-muted-foreground mb-4 text-center max-w-md">
      {{ $t('home.engines.noEnginesDesc') }}
    </p>
    <div class="mb-3 flex flex-col items-center">
      <div
        class="mb-3 px-6 py-4 border-2 rounded-md border-dashed flex transition-colors items-center justify-center"
        :class="{
          'border-primary/35 bg-primary/5': isOverDropZoneEmpty,
          'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50': !isOverDropZoneEmpty
        }"
      >
        <Download class="text-muted-foreground mr-2 h-6 w-6" />
        <span class="text-sm text-muted-foreground">{{ $t('home.engines.dropEngineFolder') }}</span>
      </div>
      <p class="text-xs text-muted-foreground">
        {{ $t('common.or') }}
      </p>
    </div>
    <Button variant="outline" class="gap-2" @click="controller.selectEngineFolder">
      <Plus class="h-4 w-4" />
      {{ $t('home.engines.installGameEngine') }}
    </Button>
  </div>
</template>
