import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import { createTestGame } from '~/__tests__/factories'
import { useWorkspaceStore } from '~/stores/workspace'

const {
  dbGetMock,
  getGameSnapshotMock,
  loggerErrorMock,
  previewRuntimeStoreMock,
  useRouteMock,
} = vi.hoisted(() => ({
  dbGetMock: vi.fn(),
  getGameSnapshotMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  previewRuntimeStoreMock: {
    ensureServeUrl: vi.fn(),
  },
  useRouteMock: vi.fn(),
}))

const routeState = reactive<{ params: Record<string, string | undefined> }>({
  params: {},
})

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

vi.mock('~/stores/preview-runtime', () => ({
  usePreviewRuntimeStore: () => previewRuntimeStoreMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: loggerErrorMock,
}))

async function flushWorkspaceWatchers() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

describe('工作区状态仓库', () => {
  beforeEach(() => {
    routeState.params = {}
    useRouteMock.mockReturnValue(routeState)
    dbGetMock.mockReset()
    getGameSnapshotMock.mockReset()
    loggerErrorMock.mockReset()
    previewRuntimeStoreMock.ensureServeUrl.mockReset()
  })

  it('不再暴露预览服务器状态与启动方法', async () => {
    const store = useWorkspaceStore()

    expect('serverUrl' in store).toBe(false)
    expect('runServer' in store).toBe(false)
  })

  it('refreshCurrentGameSnapshot 会把最新快照合并回 currentGame', async () => {
    const store = useWorkspaceStore()

    store.currentGame = createTestGame({
      path: '/games/game-1',
      metadata: {
        name: 'old',
      },
    })
    getGameSnapshotMock.mockResolvedValue({
      metadata: {
        name: 'new',
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
      createdAt: 0,
      lastModified: 0,
      status: 'created',
      metadata: {
        name: 'new',
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

  it('路由进入编辑页时会加载游戏并启动预览，离开时只清空当前状态', async () => {
    const store = useWorkspaceStore()

    dbGetMock.mockResolvedValue(createTestGame({
      id: 'game-1',
      path: '/games/game-1',
      metadata: {
        name: 'Game One',
      },
    }))
    previewRuntimeStoreMock.ensureServeUrl.mockResolvedValue('http://preview/game-1')

    routeState.params = { gameId: 'game-1' }
    await flushWorkspaceWatchers()

    expect(previewRuntimeStoreMock.ensureServeUrl).toHaveBeenCalledWith('/games/game-1')
    expect(store.currentGame).toMatchObject({
      id: 'game-1',
      path: '/games/game-1',
    })
    expect(store.currentGameServeUrl).toBe('http://preview/game-1')
    expect(store.CWD).toBe('/games/game-1')

    routeState.params = {}
    await flushWorkspaceWatchers()

    expect(store.currentGame).toBeUndefined()
    expect(store.currentGameServeUrl).toBeUndefined()
  })

  it('预览地址获取失败时保留当前游戏并记录错误', async () => {
    const store = useWorkspaceStore()

    dbGetMock.mockResolvedValue(createTestGame({
      id: 'game-2',
      path: '/games/game-2',
      metadata: {
        name: 'Game Two',
      },
    }))
    previewRuntimeStoreMock.ensureServeUrl.mockRejectedValue(new Error('preview unavailable'))

    routeState.params = { gameId: 'game-2' }
    await flushWorkspaceWatchers()

    expect(store.currentGame).toMatchObject({
      id: 'game-2',
      path: '/games/game-2',
    })
    expect(store.currentGameServeUrl).toBeUndefined()
    expect(loggerErrorMock).toHaveBeenCalledWith('获取预览链接失败: Error: preview unavailable')
  })

  it('预览地址缺失时保留当前游戏并记录直接错误', async () => {
    const store = useWorkspaceStore()

    dbGetMock.mockResolvedValue(createTestGame({
      id: 'game-3',
      path: '/games/game-3',
      metadata: {
        name: 'Game Three',
      },
    }))
    previewRuntimeStoreMock.ensureServeUrl.mockResolvedValue(undefined)

    routeState.params = { gameId: 'game-3' }
    await flushWorkspaceWatchers()

    expect(store.currentGame).toMatchObject({
      id: 'game-3',
      path: '/games/game-3',
    })
    expect(store.currentGameServeUrl).toBeUndefined()
    expect(loggerErrorMock).toHaveBeenCalledWith('获取预览链接失败: 预览链接不存在')
  })
})
