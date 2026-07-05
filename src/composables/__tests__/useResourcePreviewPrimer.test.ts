import '~/__tests__/setup'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

interface TestGame {
  engineId?: string
  path: string
}

interface TestEngine {
  availability: 'available' | 'broken' | 'missing'
  metadata: {
    webgalVersion?: string
  }
  path: string
  status: 'created' | 'creating' | 'error'
}

const {
  ensureServeUrlsMock,
  loggerErrorMock,
  loggerWarnMock,
  resolveStaticAssetSiteMock,
  usePreviewRuntimeStoreMock,
  useResourceStoreMock,
} = vi.hoisted(() => ({
  ensureServeUrlsMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  resolveStaticAssetSiteMock: vi.fn(),
  usePreviewRuntimeStoreMock: vi.fn(),
  useResourceStoreMock: vi.fn(),
}))

const resourceStoreState = reactive({
  games: undefined as TestGame[] | undefined,
  engines: undefined as TestEngine[] | undefined,
})

const previewRuntimeStoreState = {
  ensureServeUrls: ensureServeUrlsMock,
}

function createTestEngine(path: string, overrides: Partial<Omit<TestEngine, 'path'>> = {}): TestEngine {
  return {
    availability: 'available',
    metadata: { webgalVersion: '4.6.2' },
    path,
    status: 'created',
    ...overrides,
  }
}

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

vi.mock('~/stores/preview-runtime', () => ({
  usePreviewRuntimeStore: usePreviewRuntimeStoreMock,
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    resolveStaticAssetSite: resolveStaticAssetSiteMock,
  },
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: loggerErrorMock,
  warn: loggerWarnMock,
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
    vi.resetAllMocks()

    resourceStoreState.games = undefined
    resourceStoreState.engines = undefined

    useResourceStoreMock.mockReturnValue(resourceStoreState)
    usePreviewRuntimeStoreMock.mockReturnValue(previewRuntimeStoreState)
    ensureServeUrlsMock.mockResolvedValue(undefined)
    resolveStaticAssetSiteMock.mockImplementation(async (game: { path: string }) => ({ projectPath: game.path }))
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
      createTestEngine('/engines/fresh'),
    ]

    stopPrimer = useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(ensureServeUrlsMock).toHaveBeenCalledWith([
      { projectPath: '/games/alpha' },
      { projectPath: '/engines/fresh' },
    ])
  })

  it('没有资源时不会触发预热', async () => {
    resourceStoreState.games = []
    resourceStoreState.engines = []

    stopPrimer = useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(ensureServeUrlsMock).not.toHaveBeenCalled()
  })

  it('会在资源列表变化后补做预热', async () => {
    resourceStoreState.games = []
    resourceStoreState.engines = []

    stopPrimer = useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(ensureServeUrlsMock).not.toHaveBeenCalled()

    resourceStoreState.games = [
      { path: '/games/alpha' },
    ]
    await flushPrimerWatchers()

    expect(ensureServeUrlsMock).toHaveBeenCalledWith([{ projectPath: '/games/alpha' }])
  })

  it('资源查询未全部初始化时不会预热', async () => {
    resourceStoreState.games = [
      { path: '/games/broken' },
    ]

    stopPrimer = useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(resolveStaticAssetSiteMock).not.toHaveBeenCalled()
    expect(loggerWarnMock).not.toHaveBeenCalled()
  })

  it('资源列表等价更新时不会重复预热', async () => {
    resourceStoreState.games = [
      { path: '/games/broken' },
    ]
    resourceStoreState.engines = []
    resolveStaticAssetSiteMock.mockRejectedValue(new Error('引擎不可用'))

    stopPrimer = useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(resolveStaticAssetSiteMock).toHaveBeenCalledTimes(1)
    expect(loggerWarnMock).toHaveBeenCalledTimes(1)

    resourceStoreState.games = [
      { path: '/games/broken' },
    ]
    await flushPrimerWatchers()

    expect(resolveStaticAssetSiteMock).toHaveBeenCalledTimes(1)
    expect(loggerWarnMock).toHaveBeenCalledTimes(1)
  })

  it('预热失败时会记录错误而不是吞掉拒绝', async () => {
    resourceStoreState.games = [
      { path: '/games/alpha' },
    ]
    resourceStoreState.engines = []
    ensureServeUrlsMock.mockRejectedValue(new Error('server unavailable'))

    stopPrimer = useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(loggerErrorMock).toHaveBeenCalledWith(expect.stringContaining('资源预览预热失败'))
    expect(loggerErrorMock).toHaveBeenCalledWith(expect.stringContaining('server unavailable'))
  })

  it('单个游戏解析失败不会阻塞其他资源预热', async () => {
    resourceStoreState.games = [
      { path: '/games/alpha' },
      { path: '/games/broken' },
    ]
    resourceStoreState.engines = [
      createTestEngine('/engines/fresh'),
    ]
    resolveStaticAssetSiteMock.mockImplementation(async (game: { path: string }) => {
      if (game.path === '/games/broken') {
        throw new Error('引擎不可用')
      }
      return { projectPath: game.path }
    })

    stopPrimer = useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(ensureServeUrlsMock).toHaveBeenCalledWith([
      { projectPath: '/games/alpha' },
      { projectPath: '/engines/fresh' },
    ])
  })

  it('会跳过状态非 created 的引擎', async () => {
    resourceStoreState.games = []
    resourceStoreState.engines = [
      createTestEngine('/engines/fresh'),
      createTestEngine('/engines/missing', {
        availability: 'missing',
        metadata: {},
        status: 'error',
      }),
    ]

    stopPrimer = useResourcePreviewPrimer()
    await flushPrimerWatchers()

    expect(ensureServeUrlsMock).toHaveBeenCalledWith([
      { projectPath: '/engines/fresh' },
    ])
  })
})
