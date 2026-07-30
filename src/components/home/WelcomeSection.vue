<script setup lang="ts">
import { FolderOpen, Plus } from '@lucide/vue'

import { resolveHomeResourceImportNotification } from '~/features/home/shared/home-resource-import'
import {
  managedImportErrorMessages,
  reportHomeResourceImportNotification,
} from '~/features/home/shared/useHomeResourceImportActions'
import { requestImportDependencyResolution } from '~/features/modals/import-dependency-resolution/request-import-dependency-resolution'
import { createGameImportWorkflow } from '~/features/resource-import/resource-import-workflows'
import { isEngineEditorCompatible, MIN_WEBGAL_EDITOR_RUNTIME_VERSION } from '~/services/engine-manager'
import { useManagedImportStore } from '~/stores/managed-import'
import { useModalStore } from '~/stores/modal'
import { useResourceStore } from '~/stores/resource'
import { useWorkspaceStore } from '~/stores/workspace'

import type { HomeResourceImportMessages } from '~/features/home/shared/useHomeResourceImportActions'

const workspaceStore = useWorkspaceStore()
const managedImportStore = useManagedImportStore()
const resourceStore = useResourceStore()
const router = useRouter()

let hasNoGames = $ref(false)

watchOnce(() => resourceStore.games, (games) => {
  hasNoGames = !games || games.length === 0
})

const modalStore = useModalStore()
const { t } = useI18n()

const gameImportMessages: HomeResourceImportMessages = {
  ...managedImportErrorMessages,
  alreadyRegistered: t => t('home.games.importAlreadyExists'),
  engineEditorIncompatible: t => t('home.games.importEngineEditorIncompatible'),
  engineNotFound: t => t('home.games.importEngineNotFound'),
  engineUnavailable: t => t('home.games.importEngineUnavailable'),
  engineVersionInvalid: t => t('home.games.importEngineVersionInvalid'),
  engineVersionTooOld: t => t('home.games.importEngineVersionTooOld', { version: MIN_WEBGAL_EDITOR_RUNTIME_VERSION }),
  gameConfigCorrupted: t => t('home.games.importConfigCorrupted'),
  gameSchemaTooNew: t => t('home.games.importSchemaVersionTooNew'),
  invalidFolder: t => t('home.games.importInvalidFolder'),
  multipleFolders: t => t('home.games.importMultipleFolders'),
  selectFolderTitle: t => t('common.dialogs.selectGameFolder'),
  unknownError: t => t('home.games.importUnknownError'),
}

const gameImportWorkflow = createGameImportWorkflow({
  selectTitle: t('common.dialogs.selectGameFolder'),
  resolveDependencies: requestImportDependencyResolution,
  afterDesktopCommit: gameId => router.push(`/edit/${gameId}`),
  afterManagedCommit: gameId => router.push(`/edit/${gameId}`),
})

function createGame() {
  if (!resourceStore.engines) {
    return
  }

  const hasUsableEngine = resourceStore.engines.some(engine => isEngineEditorCompatible(engine))
  if (!hasUsableEngine) {
    modalStore.open('AlertModal', {
      title: t('home.engines.noEngineTitle'),
      content: t('home.engines.noEngineContent'),
      confirmText: t('home.engines.goToInstall'),
      cancelText: t('home.engines.later'),
      onConfirm: () => {
        workspaceStore.activeTab = 'engines'
      },
    })
    return
  }

  modalStore.open('CreateGameModal')
}

async function selectGameFolder() {
  try {
    const outcome = await gameImportWorkflow.importFromPicker()
    const notification = resolveHomeResourceImportNotification(undefined, outcome)
    reportHomeResourceImportNotification(notification, gameImportMessages, t)
  } catch (error: unknown) {
    logger.error(`导入游戏时发生错误: ${error}`)
    const notification = resolveHomeResourceImportNotification(error)
    reportHomeResourceImportNotification(notification, gameImportMessages, t)
  }
}
</script>

<template>
  <div class="mb-8 flex flex-col gap-4 items-start sm:flex-row sm:items-center">
    <div :class="{ 'opacity-0': !resourceStore.games }">
      <template v-if="hasNoGames">
        <h1 class="text-3xl tracking-tight font-bold">
          {{ $t('home.welcome.title') }}
        </h1>
        <p class="text-muted-foreground">
          {{ $t('home.welcome.subtitle') }}
        </p>
      </template>
      <template v-else>
        <h1 class="text-3xl tracking-tight font-bold">
          {{ $t('home.welcome.welcomeBack') }}
        </h1>
        <p class="text-muted-foreground">
          {{ $t('home.welcome.welcomeBackSubtitle') }}
        </p>
      </template>
    </div>
    <div class="ml-auto flex gap-2">
      <Button class="gap-2" @click="createGame">
        <Plus class="h-4 w-4" />
        {{ $t('home.welcome.createGame') }}
      </Button>
      <Button
        variant="outline"
        class="gap-2"
        :disabled="managedImportStore.isBusy"
        @click="selectGameFolder"
      >
        <FolderOpen class="h-4 w-4" />
        {{ $t('home.welcome.openGame') }}
      </Button>
    </div>
  </div>
</template>
