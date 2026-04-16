import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestGame } from '~/__tests__/factories'
import { usePreviewSessionStore } from '~/stores/preview-session'

const {
  ensureServeUrlMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  ensureServeUrlMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}))

vi.mock('~/stores/preview-runtime', () => ({
  usePreviewRuntimeStore: () => ({
    ensureServeUrl: ensureServeUrlMock,
  }),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: loggerErrorMock,
}))

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return {
    promise,
    resolve,
  }
}

describe('previewSessionStore 当前工作区预览会话仓库', () => {
  beforeEach(() => {
    ensureServeUrlMock.mockReset()
    loggerErrorMock.mockReset()
  })

  it('syncCurrentGame 会解析当前游戏的 serve url，并在清空会话时重置 reloadVersion', async () => {
    const store = usePreviewSessionStore()

    ensureServeUrlMock.mockResolvedValueOnce('http://preview/game-1/')
    await store.syncCurrentGame(createTestGame({
      path: '/games/game-1',
    }))

    expect(ensureServeUrlMock).toHaveBeenCalledWith('/games/game-1')
    expect(store.currentGameServeUrl).toBe('http://preview/game-1/')
    expect(store.reloadVersion).toBe(0)

    store.refresh()
    expect(store.reloadVersion).toBe(1)

    await store.syncCurrentGame(undefined)

    expect(store.currentGameServeUrl).toBeUndefined()
    expect(store.reloadVersion).toBe(0)

    store.refresh()
    expect(store.reloadVersion).toBe(0)
  })

  it('refreshIfCurrentGame 只会在路径命中当前游戏时递增 reloadVersion', async () => {
    const store = usePreviewSessionStore()

    ensureServeUrlMock.mockResolvedValue('http://preview/game-1/')
    await store.syncCurrentGame(createTestGame({
      path: '/games/game-1',
    }))

    store.refreshIfCurrentGame('/games/other')
    expect(store.reloadVersion).toBe(0)

    store.refreshIfCurrentGame('/games/game-1')
    expect(store.reloadVersion).toBe(1)
  })

  it('syncCurrentGame 在预览地址缺失时会记录错误，并保留当前会话路径用于后续刷新判断', async () => {
    const store = usePreviewSessionStore()

    ensureServeUrlMock.mockResolvedValue(undefined)
    await store.syncCurrentGame(createTestGame({
      path: '/games/game-1',
    }))

    expect(store.currentGameServeUrl).toBeUndefined()
    expect(loggerErrorMock).toHaveBeenCalledWith('获取预览链接失败: 预览链接不存在')

    store.refreshIfCurrentGame('/games/game-1')
    expect(store.reloadVersion).toBe(1)
  })

  it('syncCurrentGame 会忽略过期的异步预览地址结果', async () => {
    const store = usePreviewSessionStore()
    const firstServeUrl = createDeferred<string | undefined>()

    ensureServeUrlMock.mockReturnValueOnce(firstServeUrl.promise)
    ensureServeUrlMock.mockResolvedValueOnce('http://preview/game-2/')

    const firstSyncTask = store.syncCurrentGame(createTestGame({
      path: '/games/game-1',
    }))
    const secondSyncTask = store.syncCurrentGame(createTestGame({
      path: '/games/game-2',
    }))

    await secondSyncTask
    expect(store.currentGameServeUrl).toBe('http://preview/game-2/')

    firstServeUrl.resolve('http://preview/game-1/')
    await firstSyncTask

    expect(store.currentGameServeUrl).toBe('http://preview/game-2/')
  })
})
