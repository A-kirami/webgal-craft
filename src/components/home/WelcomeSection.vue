<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import { FolderOpen, Plus } from 'lucide-vue-next'

const workspaceStore = useWorkspaceStore()
const resourceStore = useResourceStore()
const router = useRouter()

let hasNoGames = $ref(false)

watchOnce(() => resourceStore.games, (games) => {
  hasNoGames = !games || games.length === 0
})

const modalStore = useModalStore()
const { t } = useI18n()

function createGame() {
  if (!resourceStore.engines) {
    return
  }

  if (resourceStore.engines.length === 0) {
    modalStore.open('AlertModal', {
      title: t('home.noEngineTitle'),
      content: t('home.noEngineContent'),
      confirmText: t('home.goToInstall'),
      cancelText: t('home.later'),
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
    title: t('modals.dialogs.selectGameFolder'),
    directory: true,
    multiple: false,
  })
  if (path) {
    try {
      const gameId = await gameManager.importGame(path)
      // notify.success('游戏导入成功')
      router.push(`/edit/${gameId}`)
    } catch (error: unknown) {
      logger.error(`导入游戏时发生错误: ${error}`)
      if (error instanceof GameError) {
        notify.error(error.message)
      } else {
        notify.error(t('home.games.importUnknownError'))
      }
    }
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
