import '~/__tests__/setup'

import { disposePinia, getActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine, createTestGame, createTestTemplate } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'
import { useFileStore } from '~/stores/file'
import { useResourceStore } from '~/stores/resource'
import { AppError } from '~/types/errors'

import type { Engine, Game, Template } from '~/database/model'

const {
  useEnginesMock,
  useGamesMock,
  useTemplatesMock,
  useWorkspaceStoreMock,
  resolveFilePathMock,
} = vi.hoisted(() => ({
  useEnginesMock: vi.fn(),
  useGamesMock: vi.fn(),
  useTemplatesMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
  resolveFilePathMock: vi.fn<(path: AbsPath) => Promise<AbsPath>>(),
}))

const workspaceStoreState = reactive<{
  currentGame?: Game
  searchQuery: string
}>({
  currentGame: undefined,
  searchQuery: '',
})

const gamesRef = ref<Game[] | undefined>(undefined)
const enginesRef = shallowRef<Engine[] | undefined>(undefined)
const templatesRef = ref<Template[] | undefined>(undefined)

vi.mock('~/composables/useDatabase', () => ({
  useGames: useGamesMock,
  useEngines: useEnginesMock,
  useTemplates: useTemplatesMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock(import('~/stores/file'))

vi.mock(import('@tauri-apps/plugin-log'), () => ({
  error: vi.fn(),
}))

async function flushCapabilities(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

function createGame(id: string, name: string, lastModified: number): Game {
  return createTestGame({
    id,
    path: AbsPath.from(`/games/${id}`),
    lastModified,
    metadata: {
      name,
    },
  })
}

function createEngine(id: string, name: string, createdAt: number): Engine {
  return createTestEngine({
    id,
    path: AbsPath.from(`/engines/${id}`),
    createdAt,
    name,
    metadata: {
      description: '',
      icon: 'icons/favicon.ico',
    },
  })
}

function createTemplate(id: string, name: string, createdAt: number, webgalVersion?: string): Template {
  return createTestTemplate({
    id,
    path: AbsPath.from(`/templates/${id}`),
    createdAt,
    metadata: {
      name,
      webgalVersion,
    },
  })
}

describe('useResourceStore', () => {
  afterEach(() => {
    disposePinia(getActivePinia()!)
  })

  beforeEach(() => {
    vi.resetAllMocks()
    resolveFilePathMock.mockRejectedValue(new AppError('NOT_FOUND', 'missing runtime'))
    vi.mocked(useFileStore, { partial: true }).mockReturnValue({
      initialized: Promise.resolve(),
      resolveFilePath: resolveFilePathMock,
    })

    workspaceStoreState.searchQuery = ''
    workspaceStoreState.currentGame = undefined
    gamesRef.value = undefined
    enginesRef.value = undefined
    templatesRef.value = undefined
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)
    useGamesMock.mockReturnValue(gamesRef as Ref<Game[] | undefined>)
    useEnginesMock.mockReturnValue(enginesRef as Ref<Engine[] | undefined>)
    useTemplatesMock.mockReturnValue(templatesRef as Ref<Template[] | undefined>)
  })

  it('会按修改时间 / 创建时间倒序返回过滤结果', () => {
    gamesRef.value = [
      createGame('old', 'Alpha', 1),
      createGame('new', 'Beta', 10),
    ]
    enginesRef.value = [
      createEngine('legacy', 'Legacy', 1),
      createEngine('fresh', 'Fresh', 20),
    ]

    const store = useResourceStore()

    expect(store.filteredGames.map(game => game.id)).toEqual(['new', 'old'])
    expect(store.filteredEngines.map(engine => engine.id)).toEqual(['fresh', 'legacy'])
  })

  it('会基于工作区搜索词过滤游戏、引擎和模板', () => {
    gamesRef.value = [
      createGame('alpha', 'Alpha Story', 1),
      createGame('beta', 'Beta Route', 2),
    ]
    enginesRef.value = [
      createEngine('wg', 'WebGAL', 1),
      createEngine('renpy', 'RenPy', 2),
    ]
    templatesRef.value = [
      createTemplate('modern', 'Modern Template', 1),
      createTemplate('classic', 'Classic Template', 2),
    ]

    const store = useResourceStore()

    workspaceStoreState.searchQuery = 'beta'
    expect(store.filteredGames.map(game => game.id)).toEqual(['beta'])

    workspaceStoreState.searchQuery = 'web'
    expect(store.filteredEngines.map(engine => engine.id)).toEqual(['wg'])

    workspaceStoreState.searchQuery = 'classic'
    expect(store.filteredTemplates.map(template => template.id)).toEqual(['classic'])
  })

  it('从当前游戏绑定的引擎派生模型能力，并在运行时缺失时视为不支持', async () => {
    enginesRef.value = [
      createTestEngine({
        id: 'engine-with-defaults',
        metadata: {
          description: '',
          icon: 'icons/favicon.ico',
        },
      }),
      createTestEngine({
        id: 'engine-with-live2d',
        metadata: {
          description: '',
          icon: 'icons/favicon.ico',
          live2dSupport: true,
          spineSupport: false,
        },
      }),
    ]
    workspaceStoreState.currentGame = createTestGame({ engineId: 'engine-with-defaults' })

    const store = useResourceStore()

    await flushCapabilities()

    expect(store.currentEngineCapabilities).toEqual({ live2d: false, spine: false })

    workspaceStoreState.currentGame = createTestGame({ engineId: 'engine-with-live2d' })
    expect(store.currentEngineCapabilities).toEqual({ live2d: true, spine: false })
  })

  it('工程 VFS 可解析两个 Live2D 库时启用能力，不修改引擎元数据', async () => {
    const engine = createTestEngine({ id: 'engine', metadata: { live2dSupport: false, webgalVersion: '4.6.6' } })
    enginesRef.value = [engine]
    workspaceStoreState.currentGame = createTestGame({ path: AbsPath.from('/games/v1'), engineId: engine.id })
    resolveFilePathMock.mockImplementation(async path => path)

    const store = useResourceStore()
    expect(store.currentEngineGameConfigCapabilities.legacyExpressionBlendMode).toBe(false)
    expect(store.currentEngineGameConfigCapabilities.cubismMemoryReservedSize).toBe(false)
    await flushCapabilities()

    expect(store.currentEngineCapabilities).toEqual({ live2d: true, spine: false })
    expect(store.currentEngineGameConfigCapabilities).toEqual({ legacyExpressionBlendMode: true, cubismMemoryReservedSize: true })
    expect(resolveFilePathMock).toHaveBeenCalledWith('/games/v1/lib/live2d.min.js')
    expect(resolveFilePathMock).toHaveBeenCalledWith('/games/v1/lib/live2dcubismcore.min.js')
    expect(enginesRef.value[0]?.metadata.live2dSupport).toBe(false)
  })

  it('等待文件视图初始化后再检测运行时，初始化期间不发布不支持警告', async () => {
    let finishInitialization!: () => void
    const initialized = new Promise<void>((resolve) => {
      finishInitialization = resolve
    })
    vi.mocked(useFileStore, { partial: true }).mockReturnValue({ initialized, resolveFilePath: resolveFilePathMock })
    enginesRef.value = [createTestEngine({ id: 'engine' })]
    workspaceStoreState.currentGame = createTestGame({ engineId: 'engine' })
    resolveFilePathMock.mockImplementation(async path => path)
    const store = useResourceStore()
    await flushCapabilities()

    expect(store.currentEngineCapabilities).toBeUndefined()
    expect(resolveFilePathMock).not.toHaveBeenCalled()
    finishInitialization()
    await flushCapabilities()
    expect(store.currentEngineCapabilities?.live2d).toBe(true)
  })

  it.each([
    { target: '工程', path: '/games/b', engineId: 'first' },
    { target: '引擎', path: '/games/a', engineId: 'second' },
  ])('切换$target后立即失效旧能力并重新检测', async ({ path, engineId }) => {
    enginesRef.value = [createTestEngine({ id: 'first' }), createTestEngine({ id: 'second' })]
    workspaceStoreState.currentGame = createTestGame({ path: AbsPath.from('/games/a'), engineId: 'first' })
    resolveFilePathMock.mockImplementation(async path => path)
    const store = useResourceStore()
    await flushCapabilities()
    expect(store.currentEngineCapabilities?.live2d).toBe(true)

    resolveFilePathMock.mockRejectedValue(new AppError('NOT_FOUND', 'missing runtime'))
    workspaceStoreState.currentGame = createTestGame({ path: AbsPath.from(path), engineId })
    expect(store.currentEngineCapabilities).toBeUndefined()
    await flushCapabilities()
    expect(store.currentEngineCapabilities?.live2d).toBe(false)
  })

  it.each(['live2d.min.js', 'live2dcubismcore.min.js'])('缺少 %s 时仍提示不支持 Live2D', async (missingFile) => {
    enginesRef.value = [createTestEngine({ id: 'engine' })]
    workspaceStoreState.currentGame = createTestGame({ engineId: 'engine' })
    resolveFilePathMock.mockImplementation(async (path) => {
      if (AbsPath.basename(path) === missingFile) {
        throw new AppError('NOT_FOUND', 'missing runtime')
      }
      return path
    })

    const store = useResourceStore()
    await flushCapabilities()

    expect(store.currentEngineCapabilities?.live2d).toBe(false)
  })

  it('工程切换后忽略旧工程迟到的检测结果', async () => {
    let resolveOld!: (path: AbsPath) => void
    const pending = new Promise<AbsPath>((resolve) => {
      resolveOld = resolve
    })
    enginesRef.value = [createTestEngine({ id: 'engine' })]
    workspaceStoreState.currentGame = createTestGame({ path: AbsPath.from('/games/a'), engineId: 'engine' })
    resolveFilePathMock
      .mockResolvedValueOnce(AbsPath.from('/games/a/lib/live2d.min.js'))
      .mockReturnValueOnce(pending)
    const store = useResourceStore()
    await flushCapabilities()
    expect(resolveFilePathMock).toHaveBeenCalledWith('/games/a/lib/live2dcubismcore.min.js')

    resolveFilePathMock.mockRejectedValue(new AppError('NOT_FOUND', 'missing runtime'))
    workspaceStoreState.currentGame = createTestGame({ path: AbsPath.from('/games/b'), engineId: 'engine' })
    await flushCapabilities()
    resolveOld(AbsPath.from('/games/a/lib/live2dcubismcore.min.js'))
    await flushCapabilities()

    expect(store.currentEngineCapabilities?.live2d).toBe(false)
  })

  it('VFS 读取失败时保持能力未知，不将 I/O 错误当作缺少运行时', async () => {
    enginesRef.value = [createTestEngine({ id: 'engine' })]
    workspaceStoreState.currentGame = createTestGame({ engineId: 'engine' })
    resolveFilePathMock.mockRejectedValue(new AppError('IO_ERROR', 'permission denied'))
    const store = useResourceStore()
    await flushCapabilities()

    expect(store.currentEngineCapabilities).toBeUndefined()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('permission denied'))
  })

  it('引擎记录尚未加载或当前绑定无法解析时不提供能力上下文', () => {
    workspaceStoreState.currentGame = createTestGame({ engineId: 'missing-engine' })
    const store = useResourceStore()

    expect(store.currentEngineCapabilities).toBeUndefined()

    enginesRef.value = []
    expect(store.currentEngineCapabilities).toBeUndefined()
  })

  it('从当前引擎版本派生脚本运行时能力', () => {
    enginesRef.value = [
      createTestEngine({
        id: 'webgal-462',
        metadata: {
          description: '',
          icon: 'icons/favicon.ico',
          webgalVersion: '4.6.2',
        },
      }),
      createTestEngine({
        id: 'webgal-463',
        metadata: {
          description: '',
          icon: 'icons/favicon.ico',
          webgalVersion: '4.6.3',
        },
      }),
    ]
    workspaceStoreState.currentGame = createTestGame({ engineId: 'webgal-462' })

    const store = useResourceStore()
    expect(store.currentEngineRuntimeCapabilities).toEqual({ changeFigureDiff: false, figurePositions: false, multilineStatements: false, opusVocalShorthand: false, sceneSemantics: false, seekAnimation: false, transformFrom: false })

    workspaceStoreState.currentGame = createTestGame({ engineId: 'webgal-463' })
    expect(store.currentEngineRuntimeCapabilities).toEqual({ changeFigureDiff: false, figurePositions: true, multilineStatements: true, opusVocalShorthand: true, sceneSemantics: true, seekAnimation: false, transformFrom: false })
  })

  it('游戏配置能力跟随当前绑定引擎的版本与模型声明更新', async () => {
    const engine = createTestEngine({
      id: 'config-engine',
      metadata: { description: '', icon: '', webgalVersion: '4.6.5', live2dSupport: true },
    })
    enginesRef.value = [engine]
    workspaceStoreState.currentGame = createTestGame({ engineId: engine.id })
    const store = useResourceStore()

    expect(store.currentEngineGameConfigCapabilities.legacyExpressionBlendMode).toBe(true)
    expect(store.currentEngineGameConfigCapabilities.cubismMemoryReservedSize).toBe(false)

    enginesRef.value = [{ ...engine, metadata: { ...engine.metadata, webgalVersion: '4.6.6' } }]
    expect(store.currentEngineGameConfigCapabilities.cubismMemoryReservedSize).toBe(true)
    enginesRef.value = [{ ...engine, metadata: { ...engine.metadata, webgalVersion: '4.6.6', live2dSupport: false } }]
    await flushCapabilities()
    expect(store.currentEngineGameConfigCapabilities.legacyExpressionBlendMode).toBe(false)
    expect(store.currentEngineGameConfigCapabilities.cubismMemoryReservedSize).toBe(false)

    workspaceStoreState.currentGame = createTestGame({ engineId: 'missing' })
    expect(store.currentEngineGameConfigCapabilities.legacyExpressionBlendMode).toBe(false)
    workspaceStoreState.currentGame = undefined
    expect(store.currentEngineGameConfigCapabilities.cubismMemoryReservedSize).toBe(false)
  })

  it('会把独立模板和引擎内置模板整理为模板族展示模型', () => {
    templatesRef.value = [
      createTemplate('modern', 'Modern Template', 10, '4.8.1'),
    ]
    enginesRef.value = [
      createTestEngine({
        id: 'webgal-481',
        engineId: 'open-webgal.webgal',
        name: 'WebGAL',
        path: AbsPath.from('/engines/WebGAL/4.8.1'),
        version: '4.8.1',
        metadata: {
          description: '',
          icon: 'icons/favicon.ico',
        },
      }),
      createTestEngine({
        id: 'webgal-482',
        engineId: 'open-webgal.webgal',
        name: 'WebGAL',
        path: AbsPath.from('/engines/WebGAL/4.8.2'),
        version: '4.8.2',
        status: 'created',
        metadata: {
          description: '',
          icon: 'icons/favicon.ico',
        },
      }),
      createTestEngine({
        id: 'webgal-unavailable',
        engineId: 'broken-publisher.broken',
        name: 'Broken',
        path: AbsPath.from('/engines/Broken/1.0.0'),
        version: '1.0.0',
        availability: 'broken',
        metadata: {
          description: '',
          icon: 'icons/favicon.ico',
        },
      }),
    ]

    const store = useResourceStore()

    expect(store.templateGroups).toEqual([
      expect.objectContaining({
        key: 'standalone:Modern Template',
        name: 'Modern Template',
        sourceKind: 'standalone',
        sources: [
          expect.objectContaining({
            templateId: 'modern',
            webgalVersion: '4.8.1',
          }),
        ],
      }),
      expect.objectContaining({
        key: 'engineBuiltin:open-webgal.webgal',
        name: 'WebGAL',
        sourceKind: 'engineBuiltin',
        sources: [
          expect.objectContaining({
            engineId: 'webgal-482',
            templatePath: '/engines/WebGAL/4.8.2/game/template',
          }),
          expect.objectContaining({
            engineId: 'webgal-481',
            templatePath: '/engines/WebGAL/4.8.1/game/template',
          }),
        ],
      }),
    ])
  })

  it('模板族只会纳入可作为编辑器运行时的引擎内置模板来源', () => {
    enginesRef.value = [
      createTestEngine({
        id: 'webgal-created',
        engineId: 'open-webgal.webgal',
        name: 'WebGAL',
        path: AbsPath.from('/engines/WebGAL/4.8.2'),
        version: '4.8.2',
        status: 'created',
        metadata: {
          description: '',
          icon: 'icons/favicon.ico',
        },
      }),
      createTestEngine({
        id: 'webgal-creating',
        engineId: 'open-webgal.webgal',
        name: 'WebGAL',
        path: AbsPath.from('/engines/WebGAL/4.8.3'),
        version: '4.8.3',
        status: 'creating',
        metadata: {
          description: '',
          icon: 'icons/favicon.ico',
        },
      }),
      createTestEngine({
        id: 'webgal-unavailable',
        engineId: 'open-webgal.webgal',
        name: 'WebGAL',
        path: AbsPath.from('/engines/WebGAL/4.8.1'),
        version: '4.8.1',
        availability: 'broken',
        metadata: {
          description: '',
          icon: 'icons/favicon.ico',
        },
      }),
      createTestEngine({
        id: 'webgal-incompatible',
        engineId: 'open-webgal.webgal',
        name: 'WebGAL',
        path: AbsPath.from('/engines/WebGAL/4.6.0'),
        version: '4.6.0',
        metadata: {
          description: '',
          icon: 'icons/favicon.ico',
          webgalVersion: '4.6.0',
        },
      }),
    ]

    const store = useResourceStore()

    expect(store.templateGroups).toEqual([
      expect.objectContaining({
        key: 'engineBuiltin:open-webgal.webgal',
        sources: [
          expect.objectContaining({
            engineId: 'webgal-created',
          }),
        ],
      }),
    ])
  })

  it('维护创建进度映射', () => {
    const store = useResourceStore()

    store.updateProgress('task-1', 15)
    store.updateProgress('task-1', 80)
    expect(store.getProgress('task-1')).toBe(80)

    store.finishProgress('task-1')
    expect(store.getProgress('task-1')).toBeUndefined()
  })
})
