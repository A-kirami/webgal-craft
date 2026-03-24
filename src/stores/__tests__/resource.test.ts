import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'

import { useResourceStore } from '~/stores/resource'

import type { Ref } from 'vue'
import type { Engine, Game } from '~/database/model'

const {
  useEnginesMock,
  useGamesMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  useEnginesMock: vi.fn(),
  useGamesMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

const workspaceStoreState = reactive({
  searchQuery: '',
})

const gamesRef = ref<Game[] | undefined>(undefined)
const enginesRef = ref<Engine[] | undefined>(undefined)

vi.mock('~/composables/useDatabase', () => ({
  useGames: useGamesMock,
  useEngines: useEnginesMock,
}))

vi.mock('../../composables/useDatabase', () => ({
  useGames: useGamesMock,
  useEngines: useEnginesMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('../workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

function createGame(id: string, name: string, lastModified: number): Game {
  return {
    id,
    path: `/games/${id}`,
    createdAt: 0,
    lastModified,
    status: 'created',
    metadata: {
      name,
      icon: '',
      cover: '',
    },
  }
}

function createEngine(id: string, name: string, createdAt: number): Engine {
  return {
    id,
    path: `/engines/${id}`,
    createdAt,
    status: 'created',
    metadata: {
      name,
      icon: '',
      description: '',
    },
  }
}

describe('资源状态仓库', () => {
  beforeEach(() => {
    workspaceStoreState.searchQuery = ''
    gamesRef.value = undefined
    enginesRef.value = undefined
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)
    useGamesMock.mockReturnValue(gamesRef as Ref<Game[] | undefined>)
    useEnginesMock.mockReturnValue(enginesRef as Ref<Engine[] | undefined>)
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

  it('会基于工作区搜索词过滤游戏和引擎', () => {
    gamesRef.value = [
      createGame('alpha', 'Alpha Story', 1),
      createGame('beta', 'Beta Route', 2),
    ]
    enginesRef.value = [
      createEngine('wg', 'WebGAL', 1),
      createEngine('renpy', 'RenPy', 2),
    ]

    const store = useResourceStore()

    workspaceStoreState.searchQuery = 'beta'
    expect(store.filteredGames.map(game => game.id)).toEqual(['beta'])

    workspaceStoreState.searchQuery = 'web'
    expect(store.filteredEngines.map(engine => engine.id)).toEqual(['wg'])
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
