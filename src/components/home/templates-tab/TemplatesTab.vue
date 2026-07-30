<script setup lang="ts">
import { Download, LayoutTemplate, Plus } from '@lucide/vue'

import { useTauriDropZone } from '~/composables/useTauriDropZone'
import { buildTemplateCollectionItems } from '~/features/home/templates-tab/template-collection-items'
import { useTemplatesTabController } from '~/features/home/templates-tab/useTemplatesTabController'
import { useManagedImportStore } from '~/stores/managed-import'
import { useModalStore } from '~/stores/modal'
import { usePreferenceStore } from '~/stores/preference'
import { usePreviewRuntimeStore } from '~/stores/preview-runtime'
import { useResourceStore } from '~/stores/resource'

import type { TemplateCollectionItem } from '~/features/home/home-collection-items'

const modalStore = useModalStore()
const managedImportStore = useManagedImportStore()
const preferenceStore = usePreferenceStore()
const previewRuntimeStore = usePreviewRuntimeStore()
const resourceStore = useResourceStore()
const { t } = useI18n()

const templateCollectionItems = $computed<TemplateCollectionItem[]>(() =>
  buildTemplateCollectionItems({
    engines: resourceStore.filteredEngines,
    resolveServeUrl: previewRuntimeStore.getServeUrl,
    templateGroups: resourceStore.templateGroups,
  }),
)
const controller = useTemplatesTabController({
  activeProgress: resourceStore.activeProgress,
  openDeleteTemplateModal: template => modalStore.open('DeleteTemplateModal', { template }),
  t,
})
const dropZoneEmptyRef = useTemplateRef<HTMLElement>('dropZoneEmptyRef')
const { isOverDropZone: isOverDropZoneEmpty } = useTauriDropZone(dropZoneEmptyRef, paths => controller.handleDrop(paths))
</script>

<template>
  <TemplatesTabCollectionSection
    v-if="templateCollectionItems.length > 0"
    :items="templateCollectionItems"
    :view-mode="preferenceStore.viewMode"
    :get-template-progress="controller.getTemplateGroupProgress"
    :has-template-progress="controller.hasTemplateGroupProgress"
    :import-busy="managedImportStore.isBusy"
    @delete-template="group => controller.handleDelete(group, resourceStore.templates ?? [])"
    @drop="controller.handleDrop"
    @import-click="controller.selectTemplateFolder"
    @open-source-folder="controller.handleOpenSourceFolder"
  />
  <div
    v-else
    ref="dropZoneEmptyRef"
    class="py-12 border rounded-lg border-dashed flex flex-col transition-colors items-center justify-center"
    :class="{
      'border-primary/50 bg-primary/5': isOverDropZoneEmpty,
      'border-gray-300 dark:border-gray-700': !isOverDropZoneEmpty,
    }"
  >
    <div class="mb-4 p-4 rounded-full bg-gray-100 dark:bg-gray-800">
      <LayoutTemplate class="text-muted-foreground h-10 w-10" />
    </div>
    <h3 class="text-lg font-medium mb-1">
      {{ $t('home.templates.noTemplates') }}
    </h3>
    <p class="text-sm text-muted-foreground mb-4 text-center max-w-md">
      {{ $t('home.templates.noTemplatesDesc') }}
    </p>
    <div class="mb-3 flex flex-col items-center">
      <div
        class="mb-3 px-6 py-4 border-2 rounded-md border-dashed flex transition-colors items-center justify-center"
        :class="{
          'border-primary/35 bg-primary/5': isOverDropZoneEmpty,
          'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50': !isOverDropZoneEmpty,
        }"
      >
        <Download class="text-muted-foreground mr-2 h-6 w-6" />
        <span class="text-sm text-muted-foreground">{{ $t('home.templates.dropTemplateFolder') }}</span>
      </div>
      <p class="text-xs text-muted-foreground">
        {{ $t('common.or') }}
      </p>
    </div>
    <Button
      variant="outline"
      class="gap-2"
      :disabled="managedImportStore.isBusy"
      @click="controller.selectTemplateFolder"
    >
      <Plus class="h-4 w-4" />
      {{ $t('home.templates.importTemplate') }}
    </Button>
  </div>
</template>
