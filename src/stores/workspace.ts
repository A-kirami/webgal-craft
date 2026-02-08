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
        ...metadata,
      }
    }

    const route = useRoute('/edit/[gameId]')
    watch(() => route.params, async (params, oldParams) => {
      if (oldParams?.gameId && currentGame) {
        try {
          await gameManager.stopGamePreview(currentGame.path)
        } catch (error) {
          logger.error(`停止预览失败: ${error}`)
        }
        currentGame = undefined
        currentGameServeUrl = undefined
      }

      if (params.gameId) {
        const game = await db.games.get(params.gameId)
        if (game) {
          currentGame = game
          try {
            currentGameServeUrl = await gameManager.runGamePreview(game.path)
          } catch (error) {
            currentGameServeUrl = undefined
            logger.error(`获取预览链接失败: ${error}`)
          }
        }
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
