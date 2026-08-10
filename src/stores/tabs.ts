import { defineStore } from 'pinia'

import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { AbsPath } from '~/domain/path'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { useWorkspaceStore } from '~/stores/workspace'

/**
 * 持久化标签页元数据。
 */
export interface PersistedTab {
  name: string // 标签页显示名称
  path: AbsPath // 文件路径或唯一定位
  activeAt: number // 最后激活时间戳
  isPreview: boolean // 是否为预览标签页
}

/**
 * 标签页运行时状态，不参与持久化。
 */
interface RuntimeTabState {
  isModified?: boolean // 文件是否被修改
  isLoading?: boolean // 文件是否正在加载
  error?: string
}

/**
 * 暴露给 UI 的标签页视图，由持久化元数据与运行时状态组合而成。
 */
export interface Tab extends PersistedTab, RuntimeTabState {}

/**
 * 项目标签页状态，用于按项目隔离标签页
 */
interface ProjectTabsState {
  tabs: PersistedTab[]
  activeTabIndex: number
}

function rebrandProjectTabsMap(rawState: unknown): Record<string, ProjectTabsState> {
  if (!rawState || typeof rawState !== 'object') {
    return {}
  }

  const { projectTabsMap } = rawState as { projectTabsMap?: unknown }
  if (!projectTabsMap || typeof projectTabsMap !== 'object') {
    return {}
  }

  return Object.fromEntries(
    Object.entries(projectTabsMap).map(([projectId, projectState]) => {
      if (!projectState || typeof projectState !== 'object') {
        return [projectId, { tabs: [], activeTabIndex: -1 } satisfies ProjectTabsState]
      }

      const { activeTabIndex, tabs } = projectState as {
        activeTabIndex?: number
        tabs?: PersistedTab[]
      }

      return [
        projectId,
        {
          activeTabIndex: typeof activeTabIndex === 'number' ? activeTabIndex : -1,
          tabs: Array.isArray(tabs)
            ? tabs.map(tab => ({
                ...tab,
                path: AbsPath.from(tab.path),
              }))
            : [],
        } satisfies ProjectTabsState,
      ]
    }),
  )
}

function rebasePath(path: AbsPath, oldRoot: AbsPath, newRoot: AbsPath): AbsPath | undefined {
  if (AbsPath.equals(path, oldRoot)) {
    return newRoot
  }

  try {
    return AbsPath.join(newRoot, AbsPath.relativize(path, oldRoot))
  } catch {
    return
  }
}

/**
 * 标签页 Pinia Store，负责管理所有标签页的状态与操作。
 * 支持标签页的打开、关闭、激活、预览等功能。
 */
export const useTabsStore = defineStore(
  'tabs',
  () => {
    const projectTabsMap = $ref<Record<string, ProjectTabsState>>({})
    const runtimeTabStateMap = $ref<Record<string, Record<AbsPath, RuntimeTabState>>>({})

    const workspaceStore = useWorkspaceStore()
    const fileSystemEvents = useFileSystemEvents()
    const editSettingsStore = useEditSettingsStore()

    const currentProjectId = $computed(() => workspaceStore.currentGame?.id ?? '')

    const currentProjectTabs = $computed((): ProjectTabsState => {
      if (!currentProjectId || !projectTabsMap[currentProjectId]) {
        return { tabs: [], activeTabIndex: -1 }
      }
      return projectTabsMap[currentProjectId]
    })

    const currentProjectRuntimeTabState = $computed((): Record<AbsPath, RuntimeTabState> => {
      if (!currentProjectId || !runtimeTabStateMap[currentProjectId]) {
        return {} as Record<AbsPath, RuntimeTabState>
      }
      return runtimeTabStateMap[currentProjectId]
    })

    function ensureProjectState(): ProjectTabsState | undefined {
      if (!currentProjectId) {
        return undefined
      }
      if (!projectTabsMap[currentProjectId]) {
        projectTabsMap[currentProjectId] = { tabs: [], activeTabIndex: -1 }
      }
      return projectTabsMap[currentProjectId]
    }

    function ensureProjectRuntimeState(): Record<AbsPath, RuntimeTabState> | undefined {
      if (!currentProjectId) {
        return undefined
      }
      if (!runtimeTabStateMap[currentProjectId]) {
        runtimeTabStateMap[currentProjectId] = {} as Record<AbsPath, RuntimeTabState>
      }
      return runtimeTabStateMap[currentProjectId]
    }

    const tabs = $computed(() =>
      currentProjectTabs.tabs.map(tab => ({
        ...tab,
        ...currentProjectRuntimeTabState[tab.path],
      })),
    )
    const activeTabIndex = $computed(() => currentProjectTabs.activeTabIndex)
    const activeTab = $computed(() =>
      activeTabIndex >= 0 && activeTabIndex < tabs.length ? tabs[activeTabIndex] : undefined,
    )

    let shouldFocusEditor = $ref(false)

    function clearRuntimeTabState(path: AbsPath): void {
      const runtimeState = ensureProjectRuntimeState()
      if (!runtimeState) {
        return
      }
      delete runtimeState[path]
    }

    function findTabIndex(path: AbsPath): number {
      return currentProjectTabs.tabs.findIndex(tab => tab.path === path)
    }

    function isValidTabIndex(index: number): boolean {
      return index >= 0 && index < currentProjectTabs.tabs.length
    }

    function getLastActiveTabIndex(): number {
      const lastActiveTab = currentProjectTabs.tabs.toSorted((a, b) => b.activeAt - a.activeAt)[0]
      return lastActiveTab ? findTabIndex(lastActiveTab.path) : -1
    }

    function updateRuntimeTabState(path: AbsPath, patch: RuntimeTabState): void {
      const runtimeState = ensureProjectRuntimeState()
      if (!runtimeState) {
        return
      }

      const nextState: RuntimeTabState = {
        ...runtimeState[path],
        ...patch,
      }

      if (!nextState.isModified && !nextState.isLoading && nextState.error === undefined) {
        delete runtimeState[path]
        return
      }

      runtimeState[path] = nextState
    }

    function moveRuntimeTabState(oldPath: AbsPath, newPath: AbsPath): void {
      if (oldPath === newPath) {
        return
      }

      const runtimeState = ensureProjectRuntimeState()
      if (!runtimeState) {
        return
      }

      const previousState = runtimeState[oldPath]
      delete runtimeState[oldPath]

      if (previousState) {
        runtimeState[newPath] = previousState
      }
    }

    function rebaseRuntimeTabState(oldRoot: AbsPath, newRoot: AbsPath): void {
      const runtimeState = ensureProjectRuntimeState()
      if (!runtimeState) {
        return
      }

      const entries = Object.entries(runtimeState) as [AbsPath, RuntimeTabState][]
      for (const [oldPath, previousState] of entries) {
        const newPath = rebasePath(oldPath, oldRoot, newRoot)
        if (!newPath) {
          continue
        }

        delete runtimeState[oldPath]
        runtimeState[newPath] = previousState
      }
    }

    function createAndInsertTab(name: string, path: AbsPath, isPreview: boolean) {
      const state = ensureProjectState()
      if (!state) {
        return
      }

      clearRuntimeTabState(path)

      const newTab: PersistedTab = {
        name,
        path,
        activeAt: Date.now(),
        isPreview,
      }
      const insertIndex = activeTabIndex + 1
      state.tabs.splice(insertIndex, 0, newTab)
      state.activeTabIndex = insertIndex
    }

    /**
     * 打开一个标签页。
     * 如果标签页已存在，则激活它；否则在当前激活标签页后创建新标签页。
     * @param name 标签页名称
     * @param path 文件路径
     * @param options 配置选项
     * @param options.forceNormal 是否强制以普通模式打开，忽略 enablePreviewTab 配置（默认 false）
     * @param options.focus 是否在打开时直接聚焦编辑器（默认 false）
     */
    function openTab(name: string, path: AbsPath, options?: { forceNormal?: boolean, focus?: boolean }) {
      const { forceNormal = false, focus = false } = options ?? {}

      if (!forceNormal && editSettingsStore.enablePreviewTab) {
        openPreviewTab(name, path)
        return
      }

      const existIndex = findTabIndex(path)

      if (existIndex === -1) {
        createAndInsertTab(name, path, false)
      } else {
        if (forceNormal && currentProjectTabs.tabs[existIndex].isPreview) {
          fixPreviewTab(existIndex)
        }
        activateTab(existIndex)
      }

      if (focus) {
        shouldFocusEditor = true
      }
    }

    /**
     * 以预览模式打开一个标签页，最多只能存在一个预览标签页。
     * 如果标签页已存在：
     * - 直接激活该标签页
     * 如果标签页不存在：
     * - 如果当前激活的是预览标签页，则替换它
     * - 如果存在其他预览标签页，则移除它
     * - 在当前激活标签页后创建新的预览标签页
     * @param name 标签页名称
     * @param path 文件路径
     */
    function openPreviewTab(name: string, path: AbsPath) {
      const state = ensureProjectState()
      if (!state) {
        return
      }

      const existIndex = findTabIndex(path)

      if (existIndex !== -1) {
        activateTab(existIndex)
        return
      }

      if (activeTabIndex !== -1 && currentProjectTabs.tabs[activeTabIndex].isPreview) {
        clearRuntimeTabState(currentProjectTabs.tabs[activeTabIndex].path)
        clearRuntimeTabState(path)
        state.tabs[activeTabIndex] = {
          name,
          path,
          activeAt: Date.now(),
          isPreview: true,
        }
        return
      }

      const existingPreviewIndex = currentProjectTabs.tabs.findIndex(tab => tab.isPreview)
      if (existingPreviewIndex !== -1) {
        clearRuntimeTabState(currentProjectTabs.tabs[existingPreviewIndex].path)
        state.tabs.splice(existingPreviewIndex, 1)
        if (existingPreviewIndex < activeTabIndex) {
          state.activeTabIndex--
        }
      }

      createAndInsertTab(name, path, true)
    }

    /**
     * 将预览标签页转为普通标签页。
     */
    function fixPreviewTab(index: number) {
      const state = ensureProjectState()
      if (!state || !isValidTabIndex(index)) {
        return
      }
      state.tabs[index].isPreview = false
      shouldFocusEditor = true
    }

    function activateTab(index: number) {
      const state = ensureProjectState()
      if (!state || !isValidTabIndex(index)) {
        return
      }
      state.activeTabIndex = index
      state.tabs[index].activeAt = Date.now()
    }

    /**
     * 关闭指定标签页。
     * 若关闭的是当前激活标签页，则激活最后使用的标签页。
     */
    function closeTab(index: number) {
      closeTabs([index])
    }

    /**
     * 关闭多个标签页，并在当前标签被关闭时恢复最近使用的剩余标签。
     * 使用索引快照完成一次状态转换，避免连续删除时让调用方维护变化中的索引。
     */
    function closeTabs(indices: readonly number[]) {
      const state = ensureProjectState()
      if (!state) {
        return
      }

      const pathsToClose = new Set<AbsPath>()
      for (const index of indices) {
        if (!isValidTabIndex(index)) {
          continue
        }
        pathsToClose.add(state.tabs[index].path)
      }

      if (pathsToClose.size === 0) {
        return
      }

      const activePath = state.activeTabIndex >= 0
        ? state.tabs[state.activeTabIndex]?.path
        : undefined

      state.tabs = state.tabs.filter(tab => !pathsToClose.has(tab.path))
      for (const path of pathsToClose) {
        clearRuntimeTabState(path)
      }

      state.activeTabIndex = activePath && !pathsToClose.has(activePath)
        ? state.tabs.findIndex(tab => tab.path === activePath)
        : getLastActiveTabIndex()
    }

    function reorderTab(fromIndex: number, targetIndex: number): void {
      const state = ensureProjectState()
      if (!state || !isValidTabIndex(fromIndex)) {
        return
      }

      const boundedTargetIndex = Math.min(Math.max(targetIndex, 0), state.tabs.length - 1)
      if (fromIndex === boundedTargetIndex) {
        return
      }

      const activeTabPath = state.activeTabIndex === -1
        ? undefined
        : state.tabs[state.activeTabIndex]?.path
      const [tab] = state.tabs.splice(fromIndex, 1)
      state.tabs.splice(boundedTargetIndex, 0, tab)

      if (tab.isPreview) {
        fixPreviewTab(boundedTargetIndex)
      }

      if (activeTabPath) {
        state.activeTabIndex = state.tabs.findIndex(currentTab => currentTab.path === activeTabPath)
      }
    }

    function updateTabLoading(index: number, isLoading: boolean) {
      const tab = currentProjectTabs.tabs[index]
      if (!tab) {
        return
      }
      updateRuntimeTabState(tab.path, { isLoading })
    }

    function updateTabError(index: number, error?: string) {
      const tab = currentProjectTabs.tabs[index]
      if (!tab) {
        return
      }
      updateRuntimeTabState(tab.path, { error })
    }

    function updateTabModified(index: number, isModified: boolean) {
      const state = ensureProjectState()
      if (!state || !isValidTabIndex(index)) {
        return
      }

      updateRuntimeTabState(state.tabs[index].path, { isModified })
      if (isModified && state.tabs[index].isPreview) {
        state.tabs[index].isPreview = false
      }
    }

    /** 重链接成功后清理某个项目下所有标签页与运行时状态，避免旧项目的工作区上下文带到新路径。 */
    function clearProjectState(projectId: string) {
      delete projectTabsMap[projectId]
      delete runtimeTabStateMap[projectId]
    }

    fileSystemEvents.on('file:removed', (event) => {
      const index = findTabIndex(event.path)
      if (index !== -1) {
        closeTab(index)
      }
    })

    fileSystemEvents.on('file:renamed', (event) => {
      const state = ensureProjectState()
      if (!state) {
        return
      }
      const index = findTabIndex(event.oldPath)
      if (index !== -1) {
        moveRuntimeTabState(event.oldPath, event.newPath)
        state.tabs[index].path = event.newPath
        state.tabs[index].name = AbsPath.basename(event.newPath)
      }
    })

    fileSystemEvents.on('directory:renamed', (event) => {
      const state = ensureProjectState()
      if (!state) {
        return
      }

      rebaseRuntimeTabState(event.oldPath, event.newPath)

      for (const tab of state.tabs) {
        const newPath = rebasePath(tab.path, event.oldPath, event.newPath)
        if (!newPath) {
          continue
        }

        tab.path = newPath
        tab.name = AbsPath.basename(newPath)
      }
    })

    return $$({
      tabs,
      activeTab,
      activeTabIndex,
      shouldFocusEditor,
      openTab,
      fixPreviewTab,
      activateTab,
      updateTabModified,
      closeTab,
      closeTabs,
      reorderTab,
      findTabIndex,
      updateTabLoading,
      updateTabError,
      projectTabsMap,
      runtimeTabStateMap,
      clearProjectState,
    })
  },
  {
    persist: {
      pick: ['projectTabsMap'],
      serializer: {
        serialize: JSON.stringify,
        deserialize: raw => ({
          projectTabsMap: rebrandProjectTabsMap(JSON.parse(raw)),
        }),
      },
    },
  },
)
