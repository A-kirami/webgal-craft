import { gameManager } from '~/services/game-manager'
import { usePreviewRuntimeStore } from '~/stores/preview-runtime'
import { useResourceStore } from '~/stores/resource'

import type { Engine, Game } from '~/database/model'

type PreviewPrimerGameInput = Pick<Game, 'engineId' | 'path'>
type PreviewPrimerEngineInput = Pick<Engine, 'availability' | 'metadata' | 'path' | 'status'>

function buildResourcePreviewPrimerSignature(
  games: readonly PreviewPrimerGameInput[] | undefined,
  engines: readonly PreviewPrimerEngineInput[] | undefined,
): string | undefined {
  if (!games || !engines) {
    return
  }

  return JSON.stringify({
    engines: engines
      .map(engine => ({
        availability: engine.availability,
        path: engine.path,
        status: engine.status,
        webgalVersion: engine.metadata.webgalVersion ?? '',
      }))
      .toSorted((left, right) => left.path.localeCompare(right.path)),
    games: games
      .map(game => ({
        engineId: game.engineId ?? '',
        path: game.path,
      }))
      .toSorted((left, right) => left.path.localeCompare(right.path)),
  })
}

export function useResourcePreviewPrimer(): () => void {
  const previewRuntimeStore = usePreviewRuntimeStore()
  const resourceStore = useResourceStore()

  return watch(
    () => buildResourcePreviewPrimerSignature(resourceStore.games, resourceStore.engines),
    async () => {
      const engines = resourceStore.engines
      const games = resourceStore.games

      if (!games || !engines) {
        return
      }

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
