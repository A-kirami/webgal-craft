<script setup lang="ts">
import { documentDir, join } from '@tauri-apps/api/path'

async function initializeApp() {
  const isInitialized = useStorage('app-initialized', false)
  if (!isInitialized.value) {
    const settingsStore = useSettingsStore()
    if (settingsStore.gameSavePath === '') {
      const baseDir = await documentDir()
      settingsStore.gameSavePath = await join(baseDir, 'WebGALCraft', 'games')
    }
    if (settingsStore.engineSavePath === '') {
      const baseDir = await documentDir()
      settingsStore.engineSavePath = await join(baseDir, 'WebGALCraft', 'engines')
    }
    isInitialized.value = true
  }
}

const workspaceStore = useWorkspaceStore()

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
