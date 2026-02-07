<script setup lang="ts">
import { documentDir, join } from '@tauri-apps/api/path'
import { exists } from '@tauri-apps/plugin-fs'

async function initializeApp() {
  const isInitialized = useStorage('app-initialized', false)
  if (!isInitialized.value) {
    const storageSettingsStore = useStorageSettingsStore()
    if (storageSettingsStore.gameSavePath === '') {
      const baseDir = await documentDir()
      storageSettingsStore.gameSavePath = await join(baseDir, 'WebGALCraft', 'games')
    }
    if (storageSettingsStore.engineSavePath === '') {
      const baseDir = await documentDir()
      storageSettingsStore.engineSavePath = await join(baseDir, 'WebGALCraft', 'engines')
    }
    isInitialized.value = true
  }
}

const workspaceStore = useWorkspaceStore()
const generalSettingsStore = useGeneralSettingsStore()
const router = useRouter()

async function openLastProjectIfNeeded() {
  const currentRoute = router.currentRoute.value

  if (!generalSettingsStore.openLastProject || currentRoute.path !== '/') {
    return
  }

  try {
    const lastGame = await db.games
      .orderBy('lastModified')
      // eslint-disable-next-line unicorn/no-array-reverse
      .reverse()
      .first()

    if (lastGame && lastGame.status === 'created') {
      const pathExists = await exists(lastGame.path)
      if (!pathExists) {
        logger.warn(`最近项目路径不存在，跳过自动打开: ${lastGame.path}`)
        return
      }

      await router.push(`/edit/${lastGame.id}`)
      logger.info(`自动打开最近项目: ${lastGame.metadata.name}`)
    }
  } catch (error) {
    logger.error(`自动打开最近项目失败: ${error}`)
  }
}

onMounted(async () => {
  await logger.attachConsole()
  await initializeApp()
  await workspaceStore.runServer()
  await openLastProjectIfNeeded()
})

// 全局阻止鼠标中键点击的默认滚动行为
useEventListener('mousedown', (e: MouseEvent) => {
  if (e.button === 1) {
    e.preventDefault()
  }
})
</script>

<template>
  <RouterView />
  <Notification />
  <Toaster />
  <ModalWindow />
</template>
