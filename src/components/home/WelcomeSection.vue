<script setup lang="ts">
import { FolderOpen, Plus } from '@lucide/vue'
import { open } from '@tauri-apps/plugin-dialog'

import { resolveHomeResourceImportNotification } from '~/features/home/shared/home-resource-import'
import {
  HomeResourceImportMessages,
  resolveImportNotificationMessage,
} from '~/features/home/shared/useHomeResourceImportActions'
import { requestEngineSelection } from '~/features/modals/engine-selection/request-engine-selection'
import { isEngineUsable } from '~/services/engine-manager'
import { gameManager } from '~/services/game-manager'
import { useModalStore } from '~/stores/modal'
import { useResourceStore } from '~/stores/resource'
import { useWorkspaceStore } from '~/stores/workspace'

const workspaceStore = useWorkspaceStore()
const resourceStore = useResourceStore()
const router = useRouter()

let hasNoGames = $ref(false)

watchOnce(() => resourceStore.games, (games) => {
  hasNoGames = !games || games.length === 0
})

const modalStore = useModalStore()
const { t } = useI18n()

const gameImportMessages: HomeResourceImportMessages = {
  alreadyRegistered: t => t('home.games.importAlreadyExists'),
  engineNotFound: t => t('home.games.importEngineNotFound'),
  engineUnavailable: t => t('home.games.importEngineUnavailable'),
  gameConfigCorrupted: t => t('home.games.importConfigCorrupted'),
  gameSchemaTooNew: t => t('home.games.importSchemaVersionTooNew'),
  invalidFolder: t => t('home.games.importInvalidFolder'),
  importCancelled: t => t('home.games.importCancelled'),
  multipleFolders: t => t('home.games.importMultipleFolders'),
  selectFolderTitle: t => t('common.dialogs.selectGameFolder'),
  success: t => t('home.games.importSuccess'),
  unknownError: t => t('home.games.importUnknownError'),
}

function createGame() {
  if (!resourceStore.engines) {
    return
  }

  const hasUsableEngine = resourceStore.engines.some(engine => isEngineUsable(engine))
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
  const path = await open({
    title: t('common.dialogs.selectGameFolder'),
    directory: true,
    multiple: false,
  })
  if (typeof path !== 'string') {
    return
  }

  try {
    const gameId = await gameManager.importGame(path, { selectEngine: requestEngineSelection })
    router.push(`/edit/${gameId}`)
  } catch (error: unknown) {
    logger.error(`导入游戏时发生错误: ${error}`)
    const notification = resolveHomeResourceImportNotification(error)
    if (notification.level === 'silent') {
      return
    }
    const message = resolveImportNotificationMessage(notification, gameImportMessages, t)
    notify.error(message)
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
      <Button variant="outline" class="gap-2" @click="selectGameFolder">
        <FolderOpen class="h-4 w-4" />
        {{ $t('home.welcome.openGame') }}
      </Button>
    </div>
  </div>
</template>
