import '~/__tests__/setup'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

const {
  ensureServeUrlsMock,
  loggerErrorMock,
  usePreviewRuntimeStoreMock,
  useResourceStoreMock,
} = vi.hoisted(() => ({
  ensureServeUrlsMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  usePreviewRuntimeStoreMock: vi.fn(),
  useResourceStoreMock: vi.fn(),
}))

const resourceStoreState = reactive({
  games: [] as { path: string }[],
  engines: [] as { path: string }[],
})

const previewRuntimeStoreState = {
  ensureServeUrls: ensureServeUrlsMock,
}

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

vi.mock('~/stores/preview-runtime', () => ({
  usePreviewRuntimeStore: usePreviewRuntimeStoreMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: loggerErrorMock,
}))

import { useResourcePreviewPrimer } from '~/composables/useResourcePreviewPrimer'

async function flushPrimerWatchers() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

describe('useResourcePreviewPrimer', () => {
  let stopPrimer: (() => void) | undefined

  beforeEach(() => {
    ensureServeUrlsMock.mockReset()
    loggerErrorMock.mockReset()
    usePreviewRuntimeStoreMock.mockReset()
    useResourceStoreMock.mockReset()

    resourceStoreState.games = []
    resourceStoreState.engines = []

    useResourceStoreMock.mockReturnValue(resourceStoreState)
    usePreviewRuntimeStoreMock.mockReturnValue(previewRuntimeStoreState)
    ensureServeUrlsMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    stopPrimer?.()
    stopPrimer = undefined
  })

  it('会在有资源时预热全部资源路径', async () => {
    resourceStoreState.games = [
      { path: '/games/alpha' },
    ]
    resourceStoreState.engines = [
      { path: '/engines/fresh' },
    ]

    stopPrimer = useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(ensureServeUrlsMock).toHaveBeenCalledWith(['/games/alpha', '/engines/fresh'])
  })

  it('没有资源时不会触发预热', async () => {
    stopPrimer = useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(ensureServeUrlsMock).not.toHaveBeenCalled()
  })

  it('会在资源列表变化后补做预热', async () => {
    stopPrimer = useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(ensureServeUrlsMock).not.toHaveBeenCalled()

    resourceStoreState.games = [
      { path: '/games/alpha' },
    ]
    await flushPrimerWatchers()

    expect(ensureServeUrlsMock).toHaveBeenCalledWith(['/games/alpha'])
  })

  it('预热失败时会记录错误而不是吞掉拒绝', async () => {
    resourceStoreState.games = [
      { path: '/games/alpha' },
    ]
    ensureServeUrlsMock.mockRejectedValue(new Error('server unavailable'))

    stopPrimer = useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(loggerErrorMock).toHaveBeenCalledWith(expect.stringContaining('资源预览预热失败'))
    expect(loggerErrorMock).toHaveBeenCalledWith(expect.stringContaining('server unavailable'))
  })
})
