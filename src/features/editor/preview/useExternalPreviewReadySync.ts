import { debugCommander } from '~/services/debug-commander'
import { useEditorStore } from '~/stores/editor'
import { usePreferenceStore } from '~/stores/preference'
import { usePreviewSyncStore } from '~/stores/preview-sync'

import { resolveCurrentPreviewReadySyncTarget } from './preview-ready-sync-target'

/**
 * 预览面板关闭时接管外部预览（浏览器等）的就绪初始化：
 * 外部预览就绪后补一次强制场景同步，否则它会停在初始画面直到下一次编辑操作。
 * 面板打开期间由 PreviewPanel 的内嵌预览初始化链路负责。
 */
export function useExternalPreviewReadySync(): void {
  const editorStore = useEditorStore()
  const preferenceStore = usePreferenceStore()
  const previewSyncStore = usePreviewSyncStore()

  watch(
    () => previewSyncStore.isPreviewReady,
    (isReady) => {
      if (!isReady || preferenceStore.showPreviewPanel) {
        return
      }

      const syncTarget = resolveCurrentPreviewReadySyncTarget(editorStore)
      if (!syncTarget) {
        return
      }

      void debugCommander
        .syncScene(syncTarget.path, syncTarget.lineNumber, syncTarget.lineText, { force: true })
        .catch((error: unknown) => {
          logger.error(`初始化外部预览失败: ${error}`)
        })
    },
  )
}
