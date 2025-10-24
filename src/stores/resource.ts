import { defineStore } from 'pinia'

export const useResourceStore = defineStore('resource', () => {
  const games = $(useGames())
  const engines = $(useEngines())

  // 当前正在创建的资源进度
  const activeProgress = $ref(new Map<string, number>())

  const workspaceStore = useWorkspaceStore()

  // 预排序的游戏列表
  const sortedGames = $computed(() => {
    if (!games) {
      return []
    }
    return games.toSorted((a, b) => b.lastModified - a.lastModified)
  })

  // 预排序的引擎列表
  const sortedEngines = $computed(() => {
    if (!engines) {
      return []
    }
    return engines.toSorted((a, b) => b.createdAt - a.createdAt)
  })

  // 过滤和排序游戏
  const filteredGames = $computed(() => {
    if (!workspaceStore.searchQuery) {
      return sortedGames
    }

    const query = workspaceStore.searchQuery.toLowerCase()
    return sortedGames.filter((game: Game) =>
      game.metadata.name.toLowerCase().includes(query),
    )
  })

  // 过滤和排序引擎
  const filteredEngines = $computed(() => {
    if (!workspaceStore.searchQuery) {
      return sortedEngines
    }

    const query = workspaceStore.searchQuery.toLowerCase()
    return sortedEngines.filter((engine: Engine) =>
      engine.metadata.name.toLowerCase().includes(query),
    )
  })

  function getProgress(id: string) {
    return activeProgress.get(id)
  }

  function updateProgress(id: string, progress: number) {
    activeProgress.set(id, progress)
  }

  function finishProgress(id: string) {
    activeProgress.delete(id)
  }

  return $$({
    // 游戏相关
    games,
    filteredGames,
    // 引擎相关
    engines,
    filteredEngines,
    // 创建资源进度
    activeProgress,
    getProgress,
    updateProgress,
    finishProgress,
  })
})
