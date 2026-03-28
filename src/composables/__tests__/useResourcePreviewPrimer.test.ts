import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

const {
  ensureServeUrlsMock,
  usePreviewRuntimeStoreMock,
  useResourceStoreMock,
} = vi.hoisted(() => ({
  ensureServeUrlsMock: vi.fn(),
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

import { useResourcePreviewPrimer } from '~/composables/useResourcePreviewPrimer'

async function flushPrimerWatchers() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

describe('useResourcePreviewPrimer', () => {
  beforeEach(() => {
    ensureServeUrlsMock.mockReset()
    usePreviewRuntimeStoreMock.mockReset()
    useResourceStoreMock.mockReset()

    resourceStoreState.games = []
    resourceStoreState.engines = []

    useResourceStoreMock.mockReturnValue(resourceStoreState)
    usePreviewRuntimeStoreMock.mockReturnValue(previewRuntimeStoreState)
  })

  it('会在有资源时预热全部资源路径', async () => {
    resourceStoreState.games = [
      { path: '/games/alpha' },
    ]
    resourceStoreState.engines = [
      { path: '/engines/fresh' },
    ]

    useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(ensureServeUrlsMock).toHaveBeenCalledWith(['/games/alpha', '/engines/fresh'])
  })

  it('没有资源时不会触发预热', async () => {
    useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(ensureServeUrlsMock).not.toHaveBeenCalled()
  })

  it('会在资源列表变化后补做预热', async () => {
    useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(ensureServeUrlsMock).not.toHaveBeenCalled()

    resourceStoreState.games = [
      { path: '/games/alpha' },
    ]
    await flushPrimerWatchers()

    expect(ensureServeUrlsMock).toHaveBeenCalledWith(['/games/alpha'])
  })
})
