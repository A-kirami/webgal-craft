import { defineStore } from 'pinia'

import { gameManager } from '~/services/game-manager'
import { usePreviewRuntimeStore } from '~/stores/preview-runtime'

import type { Game } from '~/database/model'

type PreviewGameTarget = Pick<Game, 'engineId' | 'path'>

export const usePreviewSessionStore = defineStore('previewSession', () => {
  let currentGamePath = $ref<string>()
  let currentGameServeUrl = $ref<string>()
  let reloadVersion = $ref(0)
  let syncToken = 0

  const previewRuntimeStore = usePreviewRuntimeStore()

  function resetState(): void {
    currentGamePath = undefined
    currentGameServeUrl = undefined
    reloadVersion = 0
  }

  async function syncCurrentGame(game?: PreviewGameTarget): Promise<void> {
    const currentToken = ++syncToken
    if (!game) {
      resetState()
      return
    }

    currentGamePath = game.path
    currentGameServeUrl = undefined
    reloadVersion = 0

    try {
      const previewSite = await gameManager.resolvePreviewSite(game)
      const previewUrl = await previewRuntimeStore.ensureServeUrl(previewSite)
      if (currentToken !== syncToken) {
        return
      }

      if (!previewUrl) {
        logger.error('获取预览链接失败: 预览链接不存在')
        return
      }

      currentGameServeUrl = previewUrl
    } catch (error) {
      if (currentToken !== syncToken) {
        return
      }

      logger.error(`获取预览链接失败: ${error}`)
    }
  }

  function refresh(): void {
    if (!currentGamePath) {
      return
    }

    reloadVersion++
  }

  function refreshIfCurrentGame(gamePath: string): void {
    if (!gamePath || currentGamePath !== gamePath) {
      return
    }

    refresh()
  }

  return $$({
    currentGameServeUrl,
    reloadVersion,
    syncCurrentGame,
    refresh,
    refreshIfCurrentGame,
  })
})
