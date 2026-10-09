<script setup lang="ts">
import { useResourcePreviewPrimer } from '~/composables/useResourcePreviewPrimer'
import { runAppStartup } from '~/features/app-startup/app-startup'
import { useAppUpdateController } from '~/features/app-update/useAppUpdateController'
import { useShortcutDispatcher } from '~/features/editor/shortcut/useShortcutDispatcher'
import { cleanupRecoverableAndroidWebExports } from '~/features/export/android-web-export-workflow'
import { recoverManagedImportSessions } from '~/features/resource-import/managed-import-recovery'
import { engineManager } from '~/services/engine-manager'
import { resolveMissingStorageSavePaths } from '~/services/platform/storage-defaults'
import { resourceReconcile } from '~/services/resource-reconcile'
import { templateManager } from '~/services/template-manager'
import { useGeneralSettingsStore } from '~/stores/general-settings'
import { useStorageSettingsStore } from '~/stores/storage-settings'

import { isDebug } from '~build/meta'

// 根窗模态挂在 App 下、编辑视图之外：派发器必须由 App 提供，模态里的浮层编辑器才能注册快捷键。
// 编辑视图自己的 useShortcutDispatcher 会把静态绑定与执行上下文贡献给这个宿主。
useShortcutDispatcher({ executeContext: undefined })

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
    cleanupRecoverableAndroidWebExports,
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
  <TooltipProvider>
    <RouterView />
    <Toaster />
    <ModalWindow />
  </TooltipProvider>
</template>
