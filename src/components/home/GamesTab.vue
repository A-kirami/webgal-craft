<script setup lang="ts">
import { Download, Plus, Scroll } from 'lucide-vue-next'

import { useTauriDropZone } from '~/composables/useTauriDropZone'
import { useModalStore } from '~/stores/modal'
import { usePreferenceStore } from '~/stores/preference'
import { useResourceStore } from '~/stores/resource'
import { useWorkspaceStore } from '~/stores/workspace'

import GamesTabCollectionSection from './games-tab/GamesTabCollectionSection.vue'
import { useGamesTabController } from './games-tab/useGamesTabController'

const modalStore = useModalStore()
const preferenceStore = usePreferenceStore()
const resourceStore = useResourceStore()
const workspaceStore = useWorkspaceStore()
const router = useRouter()
const { t } = useI18n()

const filteredGames = computed(() => resourceStore.filteredGames)
const controller = useGamesTabController({
  activeProgress: resourceStore.activeProgress,
  engines: () => resourceStore.engines,
  openCreateGameModal: () => modalStore.open('CreateGameModal'),
  openDeleteGameModal: game => modalStore.open('DeleteGameModal', { game }),
  openNoEngineAlertModal: (onConfirm) => {
    modalStore.open('AlertModal', {
      title: t('home.engines.noEngineTitle'),
      content: t('home.engines.noEngineContent'),
      confirmText: t('home.engines.goToInstall'),
      cancelText: t('home.engines.later'),
      onConfirm,
    })
  },
  pushRoute: path => router.push(path),
  switchToEnginesTab: () => {
    workspaceStore.activeTab = 'engines'
  },
  t,
})
const dropZoneEmptyRef = useTemplateRef<HTMLElement>('dropZoneEmptyRef')
const { isOverDropZone: isOverDropZoneEmpty } = useTauriDropZone(dropZoneEmptyRef, paths => controller.handleDrop(paths))
</script>

<template>
  <GamesTabCollectionSection
    v-if="filteredGames.length > 0"
    :games="filteredGames"
    :view-mode="preferenceStore.viewMode"
    :get-game-progress="controller.getGameProgress"
    :has-game-progress="controller.hasGameProgress"
    @delete-game="controller.handleDeleteGame"
    @drop="controller.handleDrop"
    @game-click="controller.handleGameClick"
    @import-click="controller.selectGameFolder"
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
      <Scroll class="text-muted-foreground h-10 w-10" />
    </div>
    <h3 class="text-lg font-medium mb-1">
      {{ $t('home.games.noGames') }}
    </h3>
    <p class="text-sm text-muted-foreground mb-4 text-center max-w-md">
      {{ $t('home.games.noGamesDesc') }}
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
        <span class="text-sm text-muted-foreground">{{ $t('home.games.dropGameFolder') }}</span>
      </div>
      <p class="text-xs text-muted-foreground">
        {{ $t('common.or') }}
      </p>
    </div>
    <Button class="gap-2" @click="controller.createGame">
      <Plus class="h-4 w-4" />
      {{ $t('home.games.createNewGame') }}
    </Button>
  </div>
</template>
