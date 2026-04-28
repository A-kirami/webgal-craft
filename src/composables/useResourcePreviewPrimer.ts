import { usePreviewRuntimeStore } from '~/stores/preview-runtime'
import { useResourceStore } from '~/stores/resource'

export function useResourcePreviewPrimer(): () => void {
  const previewRuntimeStore = usePreviewRuntimeStore()
  const resourceStore = useResourceStore()

  const previewSites = computed(() => [
    ...(resourceStore.games ?? []).map(game => ({ projectPath: game.path })),
    ...(resourceStore.engines ?? []).map(engine => ({ projectPath: engine.path })),
  ])

  return watch(
    previewSites,
    (sites) => {
      if (sites.length === 0) {
        return
      }

      void previewRuntimeStore.ensureServeUrls(sites).catch((error) => {
        void logger.error(`资源预览预热失败: ${error}`)
      })
    },
    { immediate: true },
  )
}
