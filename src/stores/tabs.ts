import { basename } from '@tauri-apps/api/path'
import { defineStore } from 'pinia'

/**
 * Tab 类型，包含所有标签页的通用属性。
 */
export interface Tab {
  // 基础标识
  name: string // 标签页显示名称
  path: string // 文件路径或唯一定位
  activeAt: number // 最后激活时间戳
  isPreview: boolean // 是否为预览标签页

  // 文件状态
  isModified?: boolean // 文件是否被修改
  isLoading?: boolean // 文件是否正在加载
  error?: string
}

/**
 * 项目标签页状态，用于按项目隔离标签页
 */
interface ProjectTabsState {
  tabs: Tab[]
  activeTabIndex: number
}

/**
 * 标签页 Pinia Store，负责管理所有标签页的状态与操作。
 * 支持标签页的打开、关闭、激活、预览等功能。
 */
export const useTabsStore = defineStore(
  'tabs',
  () => {
    const projectTabsMap = $ref<Record<string, ProjectTabsState>>({})

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

    function ensureProjectState(): ProjectTabsState | undefined {
      if (!currentProjectId) {
        return undefined
      }
      if (!projectTabsMap[currentProjectId]) {
        projectTabsMap[currentProjectId] = { tabs: [], activeTabIndex: -1 }
      }
      return projectTabsMap[currentProjectId]
    }

    const tabs = $computed(() => currentProjectTabs.tabs)
    const activeTabIndex = $computed(() => currentProjectTabs.activeTabIndex)
    const activeTab = $computed(() =>
      activeTabIndex >= 0 && activeTabIndex < tabs.length ? tabs[activeTabIndex] : undefined,
    )

    let shouldFocusEditor = $ref(false)

    function findTabIndex(path: string): number {
      return tabs.findIndex(t => t.path === path)
    }

    function isValidTabIndex(index: number): boolean {
      return index >= 0 && index < tabs.length
    }

    function getLastActiveTabIndex(): number {
      const lastActiveTab = tabs.toSorted((a, b) => b.activeAt - a.activeAt)[0]
      return lastActiveTab ? findTabIndex(lastActiveTab.path) : -1
    }

    function createAndInsertTab(name: string, path: string, isPreview: boolean) {
      const state = ensureProjectState()
      if (!state) {
        return
      }

      const newTab: Tab = {
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
    function openTab(name: string, path: string, options?: { forceNormal?: boolean, focus?: boolean }) {
      const { forceNormal = false, focus = false } = options ?? {}

      if (!forceNormal && editSettingsStore.enablePreviewTab) {
        openPreviewTab(name, path)
        return
      }

      const existIndex = findTabIndex(path)

      if (existIndex === -1) {
        createAndInsertTab(name, path, false)
      } else {
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
    function openPreviewTab(name: string, path: string) {
      const state = ensureProjectState()
      if (!state) {
        return
      }

      const existIndex = findTabIndex(path)

      if (existIndex !== -1) {
        activateTab(existIndex)
        return
      }

      if (activeTabIndex !== -1 && tabs[activeTabIndex].isPreview) {
        state.tabs[activeTabIndex] = {
          name,
          path,
          activeAt: Date.now(),
          isPreview: true,
        }
        return
      }

      const existingPreviewIndex = tabs.findIndex(tab => tab.isPreview)
      if (existingPreviewIndex !== -1) {
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
      const state = ensureProjectState()
      if (!state || !isValidTabIndex(index)) {
        return
      }
      state.tabs.splice(index, 1)
      if (index === activeTabIndex) {
        state.activeTabIndex = getLastActiveTabIndex()
      } else if (index < activeTabIndex) {
        state.activeTabIndex--
      }
    }

    function updateTabLoading(index: number, isLoading: boolean) {
      const state = ensureProjectState()
      if (!state || !isValidTabIndex(index)) {
        return
      }
      state.tabs[index].isLoading = isLoading
    }

    function updateTabError(index: number, error?: string) {
      const state = ensureProjectState()
      if (!state || !isValidTabIndex(index)) {
        return
      }
      state.tabs[index].error = error
    }

    function updateTabModified(index: number, isModified: boolean) {
      const state = ensureProjectState()
      if (!state || !isValidTabIndex(index)) {
        return
      }
      state.tabs[index].isModified = isModified
      if (isModified && state.tabs[index].isPreview) {
        state.tabs[index].isPreview = false
      }
    }

    fileSystemEvents.on('file:removed', (event) => {
      const index = findTabIndex(event.path)
      if (index !== -1) {
        closeTab(index)
      }
    })

    fileSystemEvents.on('file:renamed', async (event) => {
      const state = ensureProjectState()
      if (!state) {
        return
      }
      const index = findTabIndex(event.oldPath)
      if (index !== -1) {
        state.tabs[index].path = event.newPath
        state.tabs[index].name = await basename(event.newPath)
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
      findTabIndex,
      updateTabLoading,
      updateTabError,
      projectTabsMap,
    })
  },
  {
    persist: {
      pick: ['projectTabsMap'],
    },
  },
)
