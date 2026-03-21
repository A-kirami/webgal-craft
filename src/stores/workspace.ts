import { defineStore } from 'pinia'

import { db } from '~/database/db'

export const useWorkspaceStore = defineStore(
  'workspace',
  () => {
    // 工作区状态
    let currentGame = $ref<Game>()

    // 服务器状态
    let serverUrl = $ref<string>()
    let currentGameServeUrl = $ref<string>()

    // UI 状态
    const activeTab = $ref<'recent' | 'engines'>('recent')
    const searchQuery = $ref<string>('')
    const activeAssetTab = $ref('')

    const CWD = $computed(() => currentGame?.path)

    async function runServer() {
      try {
        serverUrl = await serverCmds.startServer('127.0.0.1', 8899)
      } catch (error) {
        logger.error(`服务器启动失败: ${error}`)
      }
    }

    async function refreshGameMetadata() {
      if (!currentGame) {
        return
      }

      const metadata = await gameManager.getGameMetadata(currentGame.path)
      currentGame = {
        ...currentGame,
        metadata: {
          ...currentGame.metadata,
          ...metadata,
        },
      }
    }

    const route = useRoute()

    function resolveRouteGameId(): string | undefined {
      if (!('gameId' in route.params)) {
        return undefined
      }

      const gameId = route.params.gameId
      return Array.isArray(gameId) ? gameId[0] : gameId
    }

    watch(() => resolveRouteGameId(), async (gameId, _oldGameId, onCleanup) => {
      let isStale = false
      onCleanup(() => {
        isStale = true
      })

      if (currentGame) {
        const previousGamePath = currentGame.path

        try {
          await gameManager.stopGamePreview(previousGamePath)
        } catch (error) {
          if (!isStale) {
            logger.error(`停止预览失败: ${error}`)
          }
        }

        if (isStale) {
          return
        }

        currentGame = undefined
        currentGameServeUrl = undefined
      }

      if (!gameId) {
        return
      }

      const game = await db.games.get(gameId)
      if (isStale || !game) {
        return
      }

      currentGame = game
      try {
        const previewUrl = await gameManager.runGamePreview(game.path)
        if (isStale) {
          return
        }

        currentGameServeUrl = previewUrl
      } catch (error) {
        if (isStale) {
          return
        }

        currentGameServeUrl = undefined
        logger.error(`获取预览链接失败: ${error}`)
      }
    })

    return $$({
      // 工作区状态
      currentGame,
      currentGameServeUrl,
      serverUrl,
      CWD,
      refreshGameMetadata,
      runServer,

      // UI 状态
      activeTab,
      searchQuery,
      activeAssetTab,
    })
  },
)
