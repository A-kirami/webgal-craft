import { defineStore } from 'pinia'

import { findGameConfigEntryValue, gameCmds } from '~/commands/game'
import { gameManager } from '~/services/game-manager'
import { usePreviewRuntimeStore } from '~/stores/preview-runtime'

import type { Game } from '~/database/model'
import type { AbsPath } from '~/domain/path'

type PreviewGameTarget = Pick<Game, 'engineId' | 'path'>

const PREVIEW_GAME_KEY_RAW_KEY = 'Game_key'

async function resolvePreviewGameId(gamePath: AbsPath): Promise<string | undefined> {
  try {
    const gameConfig = await gameCmds.getGameConfig(gamePath)
    const gameKey = findGameConfigEntryValue(gameConfig.entries, PREVIEW_GAME_KEY_RAW_KEY)?.trim()
    return gameKey || undefined
  } catch (error) {
    logger.warn(`读取预览会话 Game_key 失败: ${gamePath} - ${error}`)
    return
  }
}

export const usePreviewSessionStore = defineStore('previewSession', () => {
  let currentGamePath = $ref<AbsPath>()
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
      await previewRuntimeStore.setActivePreviewSession(undefined)
      return
    }

    currentGamePath = game.path
    currentGameServeUrl = undefined
    reloadVersion = 0

    try {
      await previewRuntimeStore.setActivePreviewSession(undefined)
      const [previewSite, previewGameId] = await Promise.all([
        gameManager.resolvePreviewSite(game),
        resolvePreviewGameId(game.path),
      ])
      const previewUrl = await previewRuntimeStore.ensureServeUrl(previewSite)
      if (currentToken !== syncToken) {
        return
      }

      if (!previewUrl) {
        logger.error('获取预览链接失败: 预览链接不存在')
        return
      }

      await previewRuntimeStore.setActivePreviewSession(previewGameId)
      if (currentToken !== syncToken) {
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

  function refreshIfCurrentGame(gamePath: AbsPath): void {
    if (!gamePath || currentGamePath !== gamePath) {
      return
    }

    refresh()
  }

  async function syncIfCurrentGame(game: PreviewGameTarget): Promise<void> {
    if (!game.path || currentGamePath !== game.path) {
      return
    }

    await syncCurrentGame(game)
    refresh()
  }

  return $$({
    currentGameServeUrl,
    reloadVersion,
    syncCurrentGame,
    refresh,
    refreshIfCurrentGame,
    syncIfCurrentGame,
  })
})
