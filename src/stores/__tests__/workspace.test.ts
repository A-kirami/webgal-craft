import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import { useWorkspaceStore } from '~/stores/workspace'

import type { Game } from '~/database/model'

const {
  dbGetMock,
  getGameMetadataMock,
  loggerErrorMock,
  runGamePreviewMock,
  startServerMock,
  stopGamePreviewMock,
  useRouteMock,
} = vi.hoisted(() => ({
  dbGetMock: vi.fn(),
  getGameMetadataMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  runGamePreviewMock: vi.fn(),
  startServerMock: vi.fn(),
  stopGamePreviewMock: vi.fn(),
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

vi.mock('~/commands/server', () => ({
  serverCmds: {
    startServer: startServerMock,
  },
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    getGameMetadata: getGameMetadataMock,
    runGamePreview: runGamePreviewMock,
    stopGamePreview: stopGamePreviewMock,
  },
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: loggerErrorMock,
}))

function createGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    path: '/games/game-1',
    createdAt: 0,
    lastModified: 0,
    status: 'created',
    metadata: {
      name: 'Game One',
      icon: 'icons/favicon.ico',
      cover: 'cover.png',
    },
    ...overrides,
  }
}

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
    runGamePreviewMock.mockReset()
    stopGamePreviewMock.mockReset()
    getGameMetadataMock.mockReset()
    startServerMock.mockReset()
    loggerErrorMock.mockReset()
  })

  it('runServer 成功时保存 serverUrl，失败时记录日志', async () => {
    const store = useWorkspaceStore()

    startServerMock.mockResolvedValueOnce('http://127.0.0.1:8899')
    await store.runServer()
    expect(store.serverUrl).toBe('http://127.0.0.1:8899')

    startServerMock.mockRejectedValueOnce(new Error('occupied'))
    await store.runServer()
    expect(loggerErrorMock).toHaveBeenCalledWith('服务器启动失败: Error: occupied')
  })

  it('refreshGameMetadata 会把最新元数据合并回 currentGame', async () => {
    const store = useWorkspaceStore()

    store.currentGame = createGame({
      metadata: {
        name: 'old',
        icon: 'icons/favicon.ico',
        cover: 'cover.png',
      },
    })
    getGameMetadataMock.mockResolvedValue({
      name: 'new',
      cover: 'cover.png',
    })

    await store.refreshGameMetadata()

    expect(getGameMetadataMock).toHaveBeenCalledWith('/games/game-1')
    expect(store.currentGame).toEqual({
      id: 'game-1',
      path: '/games/game-1',
      createdAt: 0,
      lastModified: 0,
      status: 'created',
      metadata: {
        name: 'new',
        icon: 'icons/favicon.ico',
        cover: 'cover.png',
      },
    })
  })

  it('路由进入编辑页时会加载游戏并启动预览，离开时停止预览并清空状态', async () => {
    const store = useWorkspaceStore()

    dbGetMock.mockResolvedValue(createGame({
      id: 'game-1',
      path: '/games/game-1',
      metadata: {
        name: 'Game One',
        icon: 'icons/favicon.ico',
        cover: 'cover.png',
      },
    }))
    runGamePreviewMock.mockResolvedValue('http://preview/game-1')

    routeState.params = { gameId: 'game-1' }
    await flushWorkspaceWatchers()

    expect(store.currentGame).toMatchObject({
      id: 'game-1',
      path: '/games/game-1',
    })
    expect(store.currentGameServeUrl).toBe('http://preview/game-1')
    expect(store.CWD).toBe('/games/game-1')

    routeState.params = {}
    await flushWorkspaceWatchers()

    expect(stopGamePreviewMock).toHaveBeenCalledWith('game-1')
    expect(store.currentGame).toBeUndefined()
    expect(store.currentGameServeUrl).toBeUndefined()
  })

  it('预览地址获取失败时保留当前游戏并记录错误', async () => {
    const store = useWorkspaceStore()

    dbGetMock.mockResolvedValue(createGame({
      id: 'game-2',
      path: '/games/game-2',
      metadata: {
        name: 'Game Two',
        icon: 'icons/favicon.ico',
        cover: 'cover.png',
      },
    }))
    runGamePreviewMock.mockRejectedValue(new Error('preview unavailable'))

    routeState.params = { gameId: 'game-2' }
    await flushWorkspaceWatchers()

    expect(store.currentGame).toMatchObject({
      id: 'game-2',
      path: '/games/game-2',
    })
    expect(store.currentGameServeUrl).toBeUndefined()
    expect(loggerErrorMock).toHaveBeenCalledWith('获取预览链接失败: Error: preview unavailable')
  })
})
