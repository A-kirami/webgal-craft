import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestGame } from '~/__tests__/factories'
import { useWorkspaceStore } from '~/stores/workspace'

const {
  dbGetMock,
  getGameSnapshotMock,
  previewSessionStoreMock,
  reconcileGameRecordMock,
  syncCurrentGameMock,
  useRouteMock,
} = vi.hoisted(() => ({
  dbGetMock: vi.fn(),
  getGameSnapshotMock: vi.fn(),
  previewSessionStoreMock: {
    currentGameServeUrl: undefined as string | undefined,
    syncCurrentGame: vi.fn(),
  },
  reconcileGameRecordMock: vi.fn(),
  syncCurrentGameMock: vi.fn(),
  useRouteMock: vi.fn(),
}))

const routeState = reactive<{ params: Record<string, string | undefined> }>({
  params: {},
})

const previewSessionStoreState = reactive(previewSessionStoreMock)

vi.mock('vue-router', () => ({
  useRoute: useRouteMock,
}))

vi.mock('~/database/db', () => ({
  db: {
    games: {
      get: dbGetMock,
    },
  },
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    getGameSnapshot: getGameSnapshotMock,
  },
}))

vi.mock('~/services/resource-reconcile', () => ({
  resourceReconcile: {
    reconcileGameRecord: reconcileGameRecordMock,
  },
}))

vi.mock('~/stores/preview-session', () => ({
  usePreviewSessionStore: () => previewSessionStoreState,
}))

async function flushWorkspaceWatchers() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

describe('工作区状态仓库', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    routeState.params = {}
    useRouteMock.mockReturnValue(routeState)
    previewSessionStoreState.currentGameServeUrl = undefined
    previewSessionStoreState.syncCurrentGame = syncCurrentGameMock
  })

  it('不再暴露预览服务器状态与启动方法', async () => {
    const store = useWorkspaceStore()

    expect('serverUrl' in store).toBe(false)
    expect('runServer' in store).toBe(false)
    expect('currentGameServeUrl' in store).toBe(false)
  })

  it('refreshCurrentGameSnapshot 会把最新快照合并回 currentGame', async () => {
    const store = useWorkspaceStore()

    store.currentGame = createTestGame({
      path: '/games/game-1',
      pathKey: '/games/game-1',
      metadata: {
        name: 'old',
      },
    })
    getGameSnapshotMock.mockResolvedValue({
      metadata: {
        name: 'new',
        titleImg: 'cover-next.png',
      },
      previewAssets: {
        icon: {
          path: 'icons/next.ico',
          cacheVersion: 123,
        },
        cover: {
          path: 'cover-next.png',
          cacheVersion: 456,
        },
      },
    })

    await store.refreshCurrentGameSnapshot()

    expect(getGameSnapshotMock).toHaveBeenCalledWith('/games/game-1')
    expect(store.currentGame).toEqual({
      id: 'game-1',
      path: '/games/game-1',
      pathKey: '/games/game-1',
      createdAt: 0,
      lastModified: 0,
      status: 'created',
      availability: 'available',
      metadata: {
        name: 'new',
        titleImg: 'cover-next.png',
      },
      previewAssets: {
        icon: {
          path: 'icons/next.ico',
          cacheVersion: 123,
        },
        cover: {
          path: 'cover-next.png',
          cacheVersion: 456,
        },
      },
    })
  })

  it('路由进入编辑页时会加载游戏并同步预览会话，离开时只清空当前状态', async () => {
    const store = useWorkspaceStore()

    dbGetMock.mockResolvedValue(createTestGame({
      id: 'game-1',
      path: '/games/game-1',
      metadata: {
        name: 'Game One',
      },
    }))
    syncCurrentGameMock.mockImplementation(async (game?: { path: string }) => {
      previewSessionStoreState.currentGameServeUrl = game ? 'http://preview/game-1' : undefined
    })

    routeState.params = { gameId: 'game-1' }
    await flushWorkspaceWatchers()

    expect(syncCurrentGameMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'game-1',
      path: '/games/game-1',
    }))
    expect(store.currentGame).toMatchObject({
      id: 'game-1',
      path: '/games/game-1',
    })
    expect(previewSessionStoreState.currentGameServeUrl).toBe('http://preview/game-1')
    expect(store.CWD).toBe('/games/game-1')

    routeState.params = {}
    await flushWorkspaceWatchers()

    expect(syncCurrentGameMock).toHaveBeenLastCalledWith(undefined)
    expect(store.currentGame).toBeUndefined()
    expect(previewSessionStoreState.currentGameServeUrl).toBeUndefined()
  })

  it('ensureCurrentGameAvailable 在 currentGame 可达时返回 true', async () => {
    const store = useWorkspaceStore()
    store.currentGame = createTestGame({ id: 'game-1', path: '/games/game-1' })

    reconcileGameRecordMock.mockResolvedValueOnce('available')

    await expect(store.ensureCurrentGameAvailable()).resolves.toBe(true)
  })

  it('ensureCurrentGameAvailable 在 currentGame 不可达时返回 false', async () => {
    const store = useWorkspaceStore()
    store.currentGame = createTestGame({ id: 'game-stale', path: '/games/game-stale' })

    reconcileGameRecordMock.mockResolvedValueOnce('missing')

    await expect(store.ensureCurrentGameAvailable()).resolves.toBe(false)
    expect(store.currentGame?.id).toBe('game-stale')
  })

  it('预览会话同步未写入地址时仍保留当前游戏并允许预览会话保持空地址', async () => {
    const store = useWorkspaceStore()

    dbGetMock.mockResolvedValue(createTestGame({
      id: 'game-2',
      path: '/games/game-2',
      metadata: {
        name: 'Game Two',
      },
    }))
    syncCurrentGameMock.mockResolvedValue(undefined)

    routeState.params = { gameId: 'game-2' }
    await flushWorkspaceWatchers()

    expect(syncCurrentGameMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'game-2',
      path: '/games/game-2',
    }))
    expect(store.currentGame).toMatchObject({
      id: 'game-2',
      path: '/games/game-2',
    })
    expect(previewSessionStoreState.currentGameServeUrl).toBeUndefined()
  })
})
