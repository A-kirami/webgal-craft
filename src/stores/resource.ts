import { defineStore } from 'pinia'

import { useEngines, useGames, useTemplates } from '~/composables/useDatabase'
import { resolveEngineGameConfigCapabilities } from '~/domain/engine/game-config-capabilities'
import { resolveEngineModelCapabilities } from '~/domain/engine/model-capabilities'
import { LEGACY_ENGINE_RUNTIME_CAPABILITIES, resolveEngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'
import { AbsPath, RelPath } from '~/domain/path'
import { createTemplateGroups } from '~/features/home/templates-tab/template-groups'
import { isEngineEditorCompatible } from '~/services/engine-manager'
import { useFileStore } from '~/stores/file'
import { useWorkspaceStore } from '~/stores/workspace'
import { AppError } from '~/types/errors'

import type { Engine } from '~/database/model'

interface ProjectLive2dSupport {
  gamePath: AbsPath
  engine: Engine
  supported: boolean
}

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
    sortedEngines.filter(isEngineEditorCompatible),
  )

  const currentEngine = $computed(() => {
    const currentEngineId = workspaceStore.currentGame?.engineId
    return engines?.find(engine => engine.id === currentEngineId)
  })

  // 保留数据库浅响应式查询返回的引擎对象身份，用于校验检测结果所属上下文。
  let projectLive2dSupport = $shallowRef<ProjectLive2dSupport>()

  watch([
    () => workspaceStore.currentGame?.path,
    () => currentEngine,
    () => currentEngine?.metadata.live2dSupport,
  ], async ([gamePath, engine], _previous, onCleanup) => {
    let stale = false
    onCleanup(() => {
      stale = true
    })
    projectLive2dSupport = undefined
    if (!gamePath || !engine || engine.metadata.live2dSupport === true) {
      return
    }

    const fileStore = useFileStore()
    await fileStore.initialized
    if (stale) {
      return
    }

    let supported = true
    try {
      // 与预览使用相同的 VFS 解析规则，允许两个库分别来自引擎层和工程层。
      await fileStore.resolveFilePath(AbsPath.join(gamePath, RelPath.from('lib/live2d.min.js')))
      if (stale) {
        return
      }
      await fileStore.resolveFilePath(AbsPath.join(gamePath, RelPath.from('lib/live2dcubismcore.min.js')))
    } catch (error) {
      if (stale) {
        return
      }
      if (!(error instanceof AppError) || error.code !== 'NOT_FOUND') {
        logger.error(`检测工程 Live2D 运行时失败: ${gamePath} - ${error}`)
        return
      }
      supported = false
    }
    if (!stale) {
      projectLive2dSupport = { gamePath, engine, supported }
    }
  }, { immediate: true })

  const currentEngineCapabilities = $computed(() => {
    if (!currentEngine) {
      return
    }
    const capabilities = resolveEngineModelCapabilities(currentEngine.metadata)
    if (capabilities.live2d) {
      return capabilities
    }
    if (projectLive2dSupport?.gamePath !== workspaceStore.currentGame?.path
      || projectLive2dSupport?.engine !== currentEngine) {
      return
    }
    return { ...capabilities, live2d: projectLive2dSupport.supported }
  })

  const currentEngineRuntimeCapabilities = $computed(() =>
    currentEngine
      ? resolveEngineRuntimeCapabilities(currentEngine.metadata.webgalVersion)
      : LEGACY_ENGINE_RUNTIME_CAPABILITIES,
  )

  const currentEngineGameConfigCapabilities = $computed(() =>
    resolveEngineGameConfigCapabilities({
      webgalVersion: currentEngine?.metadata.webgalVersion,
      live2dSupport: currentEngineCapabilities?.live2d,
    }),
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
    availableEngines,
    currentEngineCapabilities,
    currentEngineGameConfigCapabilities,
    currentEngineRuntimeCapabilities,
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
