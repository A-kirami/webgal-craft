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

function createGame() {
  if (!resourceStore.engines) {
    return
  }

  if (resourceStore.engines.length === 0) {
    modalStore.open('AlertModal', {
      title: '没有找到可用的游戏引擎',
      content: '需要先安装游戏引擎，才能创建游戏',
      confirmText: '前往安装',
      cancelText: '之后再说',
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
    title: '选择游戏文件夹',
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
        notify.error('导入游戏时发生未知错误')
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
          欢迎使用 WebGAL Craft
        </h1>
        <p class="text-muted-foreground">
          开始你的游戏创作之旅，编写属于你的故事
        </p>
      </template>
      <template v-else>
        <h1 class="text-3xl tracking-tight font-bold">
          欢迎回来
        </h1>
        <p class="text-muted-foreground">
          继续你的游戏编辑或开始新的创作
        </p>
      </template>
    </div>
    <div class="ml-auto flex gap-2">
      <Button class="gap-2" @click="createGame">
        <Plus class="h-4 w-4" />
        创建游戏
      </Button>
      <Button variant="outline" class="gap-2" @click="selectGameFolder">
        <FolderOpen class="h-4 w-4" />
        打开游戏
      </Button>
    </div>
  </div>
</template>
