<script setup lang="ts">
import { Box, Download, Plus } from '@lucide/vue'

import { useTauriDropZone } from '~/composables/useTauriDropZone'
import { OFFICIAL_WEBGAL_ENGINE_ID, OFFICIAL_WEBGAL_ENGINE_NAME } from '~/domain/engine/official-release'
import { buildEngineGroupCollectionItems, createEmptyEngineGroupCollectionItem } from '~/features/home/engines-tab/engine-group-view-model'
import { useEnginesTabController } from '~/features/home/engines-tab/useEnginesTabController'
import { isAndroidRuntime } from '~/services/platform/runtime'
import { useManagedImportStore } from '~/stores/managed-import'
import { useModalStore } from '~/stores/modal'
import { usePreferenceStore } from '~/stores/preference'
import { usePreviewRuntimeStore } from '~/stores/preview-runtime'
import { useResourceStore } from '~/stores/resource'

import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'

const modalStore = useModalStore()
const managedImportStore = useManagedImportStore()
const preferenceStore = usePreferenceStore()
const previewRuntimeStore = usePreviewRuntimeStore()
const resourceStore = useResourceStore()
const { t } = useI18n()

const controller = useEnginesTabController({
  activeProgress: resourceStore.activeProgress,
  android: isAndroidRuntime(),
  openDeleteEngineGroupModal: (engineId, options) => {
    const group = engineGroupItems.value.find(g => g.engineId === engineId)
    modalStore.open('DeleteEngineGroupModal', {
      engineId,
      groupName: group?.name ?? engineId,
      allUnavailable: options.allUnavailable,
    })
  },
  openDeleteEngineModal: engine => modalStore.open('DeleteEngineModal', { engine }),
  setDefaultEngineId: (engineId) => {
    preferenceStore.defaultEngineId = engineId
  },
  t,
})

const engineGroupItems = computed<EngineGroupCollectionItem[]>(() => {
  const officialReleases = controller.officialReleases.value
  const officialRemote = {
    releases: officialReleases,
    status: controller.officialStatus.value,
  } as const
  const groups = buildEngineGroupCollectionItems({
    defaultEngineId: preferenceStore.defaultEngineId,
    engines: resourceStore.filteredEngines,
    remoteByEngineId: new Map([[OFFICIAL_WEBGAL_ENGINE_ID, officialRemote]]),
    resolveServeUrl: previewRuntimeStore.getServeUrl,
  })

  const officialGroup = groups.find(group => group.engineId === OFFICIAL_WEBGAL_ENGINE_ID)
    ?? createEmptyEngineGroupCollectionItem({
      defaultEngineId: preferenceStore.defaultEngineId,
      engineId: OFFICIAL_WEBGAL_ENGINE_ID,
      name: OFFICIAL_WEBGAL_ENGINE_NAME,
      remote: officialRemote,
    })

  return [officialGroup, ...groups.filter(group => group.engineId !== OFFICIAL_WEBGAL_ENGINE_ID)]
})

function handleDrop(paths: string[]): void {
  if (managedImportStore.isBusy) {
    return
  }

  controller.handleDrop(paths)
}

onMounted(controller.loadOfficialEngineReleases)

const dropZoneEmptyRef = useTemplateRef<HTMLElement>('dropZoneEmptyRef')
const { isOverDropZone: isOverDropZoneEmpty } = useTauriDropZone(dropZoneEmptyRef, handleDrop)
</script>

<template>
  <div class="h-full min-h-0 overflow-auto space-y-4">
    <EnginesTabCollectionSection
      v-if="engineGroupItems.length > 0"
      :groups="engineGroupItems"
      :view-mode="preferenceStore.viewMode"
      :get-engine-progress="controller.getEngineProgress"
      :import-busy="managedImportStore.isBusy"
      @delete-engine="controller.handleDelete"
      @delete-group="controller.handleDeleteGroup"
      @download-version="controller.installOfficialEngine"
      @drop="controller.handleDrop"
      @import-click="controller.selectEngineFolder"
      @open-group-folder="controller.handleOpenGroupFolder"
      @open-release="controller.openOfficialRelease"
      @open-version-release="controller.openOfficialVersionRelease"
      @retry-remote="controller.loadOfficialEngineReleases"
      @set-default-engine="controller.handleSetDefaultEngine"
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
            'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50': !isOverDropZoneEmpty,
          }"
        >
          <Download class="text-muted-foreground mr-2 h-6 w-6" />
          <span class="text-sm text-muted-foreground">{{ $t('home.engines.dropEngineFolder') }}</span>
        </div>
        <p class="text-xs text-muted-foreground">
          {{ $t('common.or') }}
        </p>
      </div>
      <Button
        variant="outline"
        class="gap-2"
        :disabled="managedImportStore.isBusy"
        @click="controller.selectEngineFolder"
      >
        <Plus class="h-4 w-4" />
        {{ $t('home.engines.installGameEngine') }}
      </Button>
    </div>
  </div>
</template>
