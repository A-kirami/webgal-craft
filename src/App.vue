<script setup lang="ts">
import { useResourcePreviewPrimer } from '~/composables/useResourcePreviewPrimer'
import { runAppStartup } from '~/features/app-startup/app-startup'
import { useAppUpdateController } from '~/features/app-update/useAppUpdateController'
import { recoverManagedImportSessions } from '~/features/resource-import/managed-import-recovery'
import { engineManager } from '~/services/engine-manager'
import { resolveMissingStorageSavePaths } from '~/services/platform/storage-defaults'
import { resourceReconcile } from '~/services/resource-reconcile'
import { templateManager } from '~/services/template-manager'
import { useGeneralSettingsStore } from '~/stores/general-settings'
import { useStorageSettingsStore } from '~/stores/storage-settings'

import { isDebug } from '~build/meta'

useResourcePreviewPrimer()
const generalSettingsStore = useGeneralSettingsStore()
const storageSettingsStore = useStorageSettingsStore()
const appUpdateController = useAppUpdateController()
const router = useRouter()
const { t } = useI18n()

onMounted(async () => {
  if (isDebug) {
    await logger.attachConsole()
  }

  await runAppStartup({
    appUpdateController,
    engineManager,
    generalSettingsStore,
    resourceReconcile,
    resolveMissingStorageSavePaths,
    recoverManagedImportSessions,
    router,
    storageSettingsStore,
    templateManager,
    t,
  })
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
  <Toaster />
  <ModalWindow />
</template>
