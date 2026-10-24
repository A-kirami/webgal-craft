import { defineStore } from 'pinia'

import { findGameConfigEntryValue, gameCmds } from '~/commands/game'
import { gameManager } from '~/services/game-manager'
import { usePreviewRuntimeStore } from '~/stores/preview-runtime'

import type { Game } from '~/database/model'
import type { AbsPath } from '~/domain/path'

type PreviewGameTarget = Pick<Game, 'engineId' | 'path'>

export type PreviewServeStatus = 'idle' | 'connecting' | 'ready' | 'failed'

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
  let currentGame: PreviewGameTarget | undefined
  let currentGameServeUrl = $ref<string>()
  let serveStatus = $ref<PreviewServeStatus>('idle')
  let reloadVersion = $ref(0)
  // 初始化尝试结束不代表成功，调用方仍需检查预览 URL。
  let initialized = $shallowRef<Promise<void>>(Promise.resolve())
  let syncToken = 0

  const previewRuntimeStore = usePreviewRuntimeStore()

  function syncCurrentGame(game?: PreviewGameTarget): Promise<void> {
    const currentToken = ++syncToken
    currentGame = game
    currentGameServeUrl = undefined
    serveStatus = game ? 'connecting' : 'idle'
    reloadVersion = 0
    initialized = initializePreviewSession(game, currentToken)
    return initialized
  }

  async function initializePreviewSession(game: PreviewGameTarget | undefined, currentToken: number): Promise<void> {
    if (!game) {
      await previewRuntimeStore.setActivePreviewSession(undefined)
      return
    }

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
        serveStatus = 'failed'
        logger.error('获取预览链接失败: 预览链接不存在')
        return
      }

      await previewRuntimeStore.setActivePreviewSession(previewGameId)
      if (currentToken !== syncToken) {
        return
      }

      currentGameServeUrl = previewUrl
      serveStatus = 'ready'
    } catch (error) {
      if (currentToken !== syncToken) {
        return
      }

      serveStatus = 'failed'
      logger.error(`获取预览链接失败: ${error}`)
    }
  }

  async function refresh(): Promise<void> {
    if (!currentGame) {
      return
    }

    if (serveStatus === 'failed') {
      await syncCurrentGame(currentGame)
      return
    }

    reloadVersion++
  }

  async function refreshIfCurrentGame(gamePath: AbsPath): Promise<void> {
    if (currentGame?.path !== gamePath) {
      return
    }

    await refresh()
  }

  async function syncIfCurrentGame(game: PreviewGameTarget): Promise<void> {
    if (currentGame?.path !== game.path) {
      return
    }

    await syncCurrentGame(game)
  }

  return $$({
    currentGameServeUrl,
    serveStatus,
    reloadVersion,
    initialized,
    syncCurrentGame,
    refresh,
    refreshIfCurrentGame,
    syncIfCurrentGame,
  })
})
