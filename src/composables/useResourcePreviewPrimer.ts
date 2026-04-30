import { gameManager } from '~/services/game-manager'
import { usePreviewRuntimeStore } from '~/stores/preview-runtime'
import { useResourceStore } from '~/stores/resource'

export function useResourcePreviewPrimer(): () => void {
  const previewRuntimeStore = usePreviewRuntimeStore()
  const resourceStore = useResourceStore()

  return watch(
    () => ({
      engines: resourceStore.engines ?? [],
      games: resourceStore.games ?? [],
    }),
    async ({ engines, games }) => {
      if (games.length === 0 && engines.length === 0) {
        return
      }

      try {
        const gameResults = await Promise.allSettled(
          games.map(game => gameManager.resolvePreviewSite(game)),
        )
        const gameSites = gameResults.flatMap((result, index) => {
          if (result.status === 'fulfilled') {
            return [result.value]
          }
          void logger.warn(`跳过游戏预览预热 ${games[index]?.path}: ${result.reason}`)
          return []
        })
        const engineSites = engines
          .filter(engine => engine.status === 'created')
          .map(engine => ({ projectPath: engine.path }))

        await previewRuntimeStore.ensureServeUrls([
          ...gameSites,
          ...engineSites,
        ])
      } catch (error) {
        void logger.error(`资源预览预热失败: ${error}`)
      }
    },
    { immediate: true },
  )
}
