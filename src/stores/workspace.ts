import { defineStore } from 'pinia'

import { db } from '~/database/db'
import { Game } from '~/database/model'
import { gameManager } from '~/services/game-manager'
import { resourceReconcile } from '~/services/resource-reconcile'
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

      const expectedId = currentGame.id
      const expectedPath = currentGame.path

      // 先从 DB 重新拉取游戏记录，捕获 engineId 等持久化字段的变更
      const fresh = await db.games.get(expectedId)
      const snapshot = await gameManager.getGameSnapshot(expectedPath)

      if (!currentGame || currentGame.id !== expectedId || currentGame.path !== expectedPath) {
        return
      }

      currentGame = {
        ...currentGame,
        ...fresh,
        ...snapshot,
      }
    }

    /** 校验当前游戏是否仍然可达，结果由调用方决定是否进入恢复弹窗。 */
    async function ensureCurrentGameAvailable(): Promise<boolean> {
      if (!currentGame) {
        return true
      }
      const expectedId = currentGame.id
      const availability = await resourceReconcile.reconcileGameRecord(currentGame)
      // reconcile 期间用户可能已切换游戏，避免把过期的可用性写到新工作区
      if (currentGame?.id === expectedId && currentGame.availability !== availability) {
        currentGame = { ...currentGame, availability }
      }
      return availability === 'available'
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
      ensureCurrentGameAvailable,

      // UI 状态
      activeTab,
      searchQuery,
      activeAssetTab,
    })
  },
)
