<script setup lang="ts">
import { documentDir, join } from '@tauri-apps/api/path'

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

onBeforeMount(() => {
  // 确保 GeneralSettingsStore 在应用初始化前被创建
  useGeneralSettingsStore()
})

onMounted(async () => {
  await logger.attachConsole()
  await initializeApp()
  await workspaceStore.runServer()
})
</script>

<template>
  <RouterView />
  <Notification />
  <Toaster />
  <ModalWindow />
</template>
