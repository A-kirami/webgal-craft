import { defineStore } from 'pinia'

import { useEngines, useGames, useTemplates } from '~/composables/useDatabase'
import { createTemplateGroups } from '~/features/home/templates-tab/template-groups'
import { isEngineUsable } from '~/services/engine-manager'
import { useWorkspaceStore } from '~/stores/workspace'

export const useResourceStore = defineStore('resource', () => {
  const games = $(useGames())
  const engines = $(useEngines())
  const templates = $(useTemplates())

  // 当前正在创建的资源进度
  const activeProgress = $ref(new Map<string, number>())

  const workspaceStore = useWorkspaceStore()

  function filterBySearchQuery<T>(
    items: T[] | undefined,
    getName: (item: T) => string,
  ): T[] {
    if (!items) {
      return []
    }
    if (!workspaceStore.searchQuery) {
      return items
    }
    const query = workspaceStore.searchQuery.toLowerCase()
    return items.filter(item => getName(item).toLowerCase().includes(query))
  }

  // 预排序的列表
  const sortedGames = $computed(() =>
    games?.toSorted((a, b) => b.lastModified - a.lastModified) ?? [],
  )

  const sortedEngines = $computed(() =>
    engines?.toSorted((a, b) => b.createdAt - a.createdAt) ?? [],
  )

  const sortedTemplates = $computed(() =>
    templates?.toSorted((a, b) => b.createdAt - a.createdAt) ?? [],
  )

  const filteredGames = $computed(() =>
    filterBySearchQuery(sortedGames, game => game.metadata.name),
  )

  const filteredEngines = $computed(() =>
    filterBySearchQuery(sortedEngines, engine => engine.name),
  )

  const availableEngines = $computed(() =>
    sortedEngines.filter(engine => isEngineUsable(engine)),
  )

  const filteredTemplates = $computed(() =>
    filterBySearchQuery(sortedTemplates, template => template.metadata.name),
  )

  const templateGroups = $computed(() =>
    createTemplateGroups(filteredTemplates, availableEngines),
  )

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
    // 模板相关
    templates,
    filteredTemplates,
    templateGroups,
    // 创建资源进度
    activeProgress,
    getProgress,
    updateProgress,
    finishProgress,
  })
})
