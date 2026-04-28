import { defineStore } from 'pinia'

import { db } from '~/database/db'
import { Game } from '~/database/model'
import { gameManager } from '~/services/game-manager'
import { usePreviewSessionStore } from '~/stores/preview-session'

import type { HomeTabId } from '~/features/home/home-tabs'

export const useWorkspaceStore = defineStore(
  'workspace',
  () => {
    // 工作区状态
    let currentGame = $ref<Game>()

    // UI 状态
    const activeTab = $ref<HomeTabId>('recent')
    const searchQuery = $ref<string>('')
    const activeAssetTab = $ref('')

    const previewSessionStore = usePreviewSessionStore()
    const CWD = $computed(() => currentGame?.path)

    async function refreshCurrentGameSnapshot() {
      if (!currentGame) {
        return
      }

      // 先从 DB 重新拉取游戏记录，捕获 engineId 等持久化字段的变更
      const fresh = await db.games.get(currentGame.id)
      const snapshot = await gameManager.getGameSnapshot(currentGame.path)
      currentGame = {
        ...currentGame,
        ...fresh,
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

      currentGame = undefined
      await previewSessionStore.syncCurrentGame(undefined)

      if (!gameId) {
        return
      }

      const game = await db.games.get(gameId)
      if (isStale || !game) {
        return
      }

      currentGame = game
      await previewSessionStore.syncCurrentGame(game)
      if (isStale) {
        currentGame = undefined
        await previewSessionStore.syncCurrentGame(undefined)
      }
    })

    return $$({
      // 工作区状态
      currentGame,
      CWD,
      refreshCurrentGameSnapshot,

      // UI 状态
      activeTab,
      searchQuery,
      activeAssetTab,
    })
  },
)
