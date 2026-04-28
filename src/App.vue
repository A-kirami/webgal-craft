<script setup lang="ts">
import { exists } from '@tauri-apps/plugin-fs'

import { useResourcePreviewPrimer } from '~/composables/useResourcePreviewPrimer'
import { db } from '~/database/db'
import { engineManager } from '~/services/engine-manager'
import { resolveMissingStorageSavePaths } from '~/services/platform/storage-defaults'
import { templateManager } from '~/services/template-manager'
import { useGeneralSettingsStore } from '~/stores/general-settings'
import { useStorageSettingsStore } from '~/stores/storage-settings'

async function initializeApp() {
  const storageSettingsStore = useStorageSettingsStore()
  const missingStoragePaths = await resolveMissingStorageSavePaths(storageSettingsStore)

  if (Object.keys(missingStoragePaths).length > 0) {
    storageSettingsStore.$patch(missingStoragePaths)
  }
}

useResourcePreviewPrimer()
const generalSettingsStore = useGeneralSettingsStore()
const router = useRouter()

async function openLastProjectIfNeeded() {
  if (!generalSettingsStore.openLastProject || router.currentRoute.value.path !== '/') {
    return
  }

  try {
    const lastGame = await db.games.orderBy('lastModified').last()

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
  await engineManager.validateAllEngines()
  await templateManager.validateAllTemplates()
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
