import { defineStore } from 'pinia'

import { db } from '~/database/db'
import { Game } from '~/database/model'
import { gameManager } from '~/services/game-manager'
import { usePreviewRuntimeStore } from '~/stores/preview-runtime'

import type { HomeTabId } from '~/features/home/home-tabs'

export const useWorkspaceStore = defineStore(
  'workspace',
  () => {
    // 工作区状态
    let currentGame = $ref<Game>()
    let currentGameServeUrl = $ref<string>()

    // UI 状态
    const activeTab = $ref<HomeTabId>('recent')
    const searchQuery = $ref<string>('')
    const activeAssetTab = $ref('')

    const previewRuntimeStore = usePreviewRuntimeStore()
    const CWD = $computed(() => currentGame?.path)

    async function refreshCurrentGameSnapshot() {
      if (!currentGame) {
        return
      }

      const snapshot = await gameManager.getGameSnapshot(currentGame.path)
      currentGame = {
        ...currentGame,
        ...snapshot,
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
        const previewUrl = await previewRuntimeStore.ensureServeUrl(game.path)
        if (isStale) {
          return
        }

        if (!previewUrl) {
          currentGameServeUrl = undefined
          logger.error('获取预览链接失败: 预览链接不存在')
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
      CWD,
      refreshCurrentGameSnapshot,

      // UI 状态
      activeTab,
      searchQuery,
      activeAssetTab,
    })
  },
)
