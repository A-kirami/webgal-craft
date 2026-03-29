import { usePreviewRuntimeStore } from '~/stores/preview-runtime'
import { useResourceStore } from '~/stores/resource'

export function useResourcePreviewPrimer(): () => void {
  const previewRuntimeStore = usePreviewRuntimeStore()
  const resourceStore = useResourceStore()

  const previewPaths = computed(() => [
    ...(resourceStore.games ?? []).map(game => game.path),
    ...(resourceStore.engines ?? []).map(engine => engine.path),
  ])

  return watch(
    previewPaths,
    (paths) => {
      if (paths.length === 0) {
        return
      }

      void previewRuntimeStore.ensureServeUrls(paths).catch((error) => {
        void logger.error(`资源预览预热失败: ${error}`)
      })
    },
    { immediate: true },
  )
}
