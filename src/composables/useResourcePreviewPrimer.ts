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
          games.map(game => gameManager.resolveStaticAssetSite(game)),
        )
        const failedGameResults: string[] = []
        const gameSites = gameResults.flatMap((result, index) => {
          if (result.status === 'fulfilled') {
            return [result.value]
          }
          failedGameResults.push(`${games[index]?.path ?? 'unknown'}: ${String(result.reason)}`)
          return []
        })
        if (failedGameResults.length > 0) {
          const sample = failedGameResults.slice(0, 3).join('; ')
          const suffix = failedGameResults.length > 3 ? `; 另有 ${failedGameResults.length - 3} 个失败` : ''
          void logger.warn(`资源预览预热跳过 ${failedGameResults.length} 个游戏: ${sample}${suffix}`)
        }

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
