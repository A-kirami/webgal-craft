import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'

import { usePreviewRuntimeStore } from '~/stores/preview-runtime'

const {
  addStaticSiteMock,
  loggerErrorMock,
  startServerMock,
} = vi.hoisted(() => ({
  addStaticSiteMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  startServerMock: vi.fn(),
}))

vi.mock('~/commands/server', () => ({
  serverCmds: {
    addStaticSite: addStaticSiteMock,
    startServer: startServerMock,
  },
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: loggerErrorMock,
}))

describe('previewRuntimeStore 预览运行时状态仓库', () => {
  beforeEach(() => {
    addStaticSiteMock.mockReset()
    loggerErrorMock.mockReset()
    startServerMock.mockReset()
  })

  it('ensureServeUrl 会按需启动预览服务器并缓存 serve url', async () => {
    startServerMock.mockResolvedValue('http://127.0.0.1:8899/')
    addStaticSiteMock.mockResolvedValue('game-alpha')
    const store = usePreviewRuntimeStore()

    expect('ensureServer' in store).toBe(false)
    expect('serverUrl' in store).toBe(false)
    expect(store.getServeUrl('/games/alpha')).toBeUndefined()

    await expect(store.ensureServeUrl('/games/alpha')).resolves.toBe(
      'http://127.0.0.1:8899/game/game-alpha/',
    )
    await expect(store.ensureServeUrl('/games/alpha')).resolves.toBe(
      'http://127.0.0.1:8899/game/game-alpha/',
    )

    expect(startServerMock).toHaveBeenCalledTimes(1)
    expect(startServerMock).toHaveBeenCalledWith('127.0.0.1', 8899)
    expect(addStaticSiteMock).toHaveBeenCalledTimes(1)
    expect(addStaticSiteMock).toHaveBeenCalledWith('/games/alpha')
    expect(store.getServeUrl('/games/alpha')).toBe('http://127.0.0.1:8899/game/game-alpha/')
  })

  it('ensureServeUrl 并发调用同一路径时只会启动一次服务器并注册一次站点', async () => {
    startServerMock.mockResolvedValue('http://127.0.0.1:8899/')
    addStaticSiteMock.mockResolvedValue('game-alpha')
    const store = usePreviewRuntimeStore()

    const [firstUrl, secondUrl] = await Promise.all([
      store.ensureServeUrl('/games/alpha'),
      store.ensureServeUrl('/games/alpha'),
    ])

    expect(firstUrl).toBe('http://127.0.0.1:8899/game/game-alpha/')
    expect(secondUrl).toBe('http://127.0.0.1:8899/game/game-alpha/')
    expect(startServerMock).toHaveBeenCalledTimes(1)
    expect(addStaticSiteMock).toHaveBeenCalledTimes(1)
    expect(store.getServeUrl('/games/alpha')).toBe('http://127.0.0.1:8899/game/game-alpha/')
  })

  it('ensureServeUrl 在服务器启动失败时会记录日志并返回 undefined', async () => {
    startServerMock.mockRejectedValue(new Error('occupied'))
    const store = usePreviewRuntimeStore()

    await expect(store.ensureServeUrl('/games/alpha')).resolves.toBeUndefined()

    expect(loggerErrorMock).toHaveBeenCalledWith('服务器启动失败: Error: occupied')
  })

  it('ensureServeUrl 在静态站点注册失败时会记录日志并返回 undefined', async () => {
    startServerMock.mockResolvedValue('http://127.0.0.1:8899/')
    addStaticSiteMock.mockRejectedValue(new Error('register failed'))
    const store = usePreviewRuntimeStore()

    await expect(store.ensureServeUrl('/games/alpha')).resolves.toBeUndefined()

    expect(loggerErrorMock).toHaveBeenCalledWith(
      '注册静态站点失败: /games/alpha - Error: register failed',
    )
  })

  it('ensureServeUrls 会记录失败的路径', async () => {
    startServerMock.mockResolvedValue('http://127.0.0.1:8899/')
    addStaticSiteMock
      .mockResolvedValueOnce('game-alpha')
      .mockRejectedValueOnce(new Error('register failed'))
    const store = usePreviewRuntimeStore()

    await store.ensureServeUrls(['/games/alpha', '/engines/beta'])

    expect(loggerErrorMock).toHaveBeenCalledWith(
      '注册静态站点失败: /engines/beta - Error: register failed',
    )
  })

  it('ensureServeUrls 会过滤空路径，并按原始路径字符串去重', async () => {
    startServerMock.mockResolvedValue('http://127.0.0.1:8899/')
    addStaticSiteMock.mockResolvedValue('game-alpha')
    const store = usePreviewRuntimeStore()

    await store.ensureServeUrls(['', '/games/alpha ', '/games/alpha ', '/games/alpha'])

    expect(startServerMock).toHaveBeenCalledTimes(1)
    expect(addStaticSiteMock).toHaveBeenCalledTimes(2)
    expect(addStaticSiteMock).toHaveBeenNthCalledWith(1, '/games/alpha ')
    expect(addStaticSiteMock).toHaveBeenNthCalledWith(2, '/games/alpha')
  })

  it('getServeUrl 会在站点预热完成后触发依赖它的响应式更新', async () => {
    startServerMock.mockResolvedValue('http://127.0.0.1:8899/')
    addStaticSiteMock.mockResolvedValue('game-alpha')
    const store = usePreviewRuntimeStore()
    const serveUrl = computed(() => store.getServeUrl('/games/alpha'))

    expect(serveUrl.value).toBeUndefined()

    await store.ensureServeUrls(['/games/alpha'])

    expect(serveUrl.value).toBe('http://127.0.0.1:8899/game/game-alpha/')
  })
})
