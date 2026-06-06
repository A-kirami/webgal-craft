<script setup lang="ts">
import { useResourcePreviewPrimer } from '~/composables/useResourcePreviewPrimer'
import { db } from '~/database/db'
import { useAppUpdateController } from '~/features/app-update/useAppUpdateController'
import { engineManager } from '~/services/engine-manager'
import { resolveMissingStorageSavePaths } from '~/services/platform/storage-defaults'
import { resourceReconcile } from '~/services/resource-reconcile'
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
const appUpdateController = useAppUpdateController()
const router = useRouter()
const { t } = useI18n()

async function openLastProjectIfNeeded() {
  if (!generalSettingsStore.openLastProject || router.currentRoute.value.path !== '/') {
    return
  }

  try {
    const lastGame = await db.games.orderBy('lastModified').last()
    if (!lastGame || lastGame.status !== 'created') {
      return
    }

    if (lastGame.availability !== 'available') {
      logger.warn(`最近项目当前不可用，跳过自动打开: ${lastGame.path}`)
      notify.warning(t('home.games.openLastProjectUnavailable', { name: lastGame.metadata.name }))
      return
    }

    await router.push(`/edit/${lastGame.id}`)
    logger.info(`自动打开最近项目: ${lastGame.metadata.name}`)
  } catch (error) {
    logger.error(`自动打开最近项目失败: ${error}`)
  }
}

async function runValidation(label: string, validate: () => Promise<unknown>) {
  try {
    await validate()
  } catch (error) {
    logger.error(`${label}失败: ${error}`)
  }
}

onMounted(async () => {
  await logger.attachConsole()
  await initializeApp()
  await Promise.all([
    runValidation('引擎校验', () => engineManager.validateAllEngines()),
    runValidation('游戏校验', () => resourceReconcile.reconcileAllGames()),
    runValidation('模板校验', () => templateManager.validateAllTemplates()),
  ])
  await openLastProjectIfNeeded()
  void appUpdateController.checkForUpdate('startup')
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
