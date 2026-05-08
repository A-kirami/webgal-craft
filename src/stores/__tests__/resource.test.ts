import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine, createTestGame, createTestTemplate } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'
import { useResourceStore } from '~/stores/resource'

import type { Engine, Game, Template } from '~/database/model'

const {
  useEnginesMock,
  useGamesMock,
  useTemplatesMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  useEnginesMock: vi.fn(),
  useGamesMock: vi.fn(),
  useTemplatesMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

const workspaceStoreState = reactive({
  searchQuery: '',
})

const gamesRef = ref<Game[] | undefined>(undefined)
const enginesRef = ref<Engine[] | undefined>(undefined)
const templatesRef = ref<Template[] | undefined>(undefined)

vi.mock('~/composables/useDatabase', () => ({
  useGames: useGamesMock,
  useEngines: useEnginesMock,
  useTemplates: useTemplatesMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

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
  beforeEach(() => {
    vi.resetAllMocks()

    workspaceStoreState.searchQuery = ''
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

  it('模板族只会纳入状态正常的引擎内置模板来源', () => {
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
