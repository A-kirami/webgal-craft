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

    const currentProjectTabs = $computed(() => {
      if (!currentProjectId) {
        return { tabs: [], activeTabIndex: -1 }
      }
      if (!projectTabsMap[currentProjectId]) {
        projectTabsMap[currentProjectId] = { tabs: [], activeTabIndex: -1 }
      }
      return projectTabsMap[currentProjectId]
    })

    const tabs = $computed(() => currentProjectTabs.tabs)
    const activeTabIndex = $computed({
      get: () => currentProjectTabs.activeTabIndex,
      set: (value: number) => {
        if (currentProjectId) {
          currentProjectTabs.activeTabIndex = value
        }
      },
    })

    const activeTab = $computed(() =>
      activeTabIndex >= 0 && activeTabIndex < tabs.length ? tabs[activeTabIndex] : undefined,
    )

    /**
     * 根据标签页路径查找其索引
     */
    function findTabIndex(path: string): number {
      return tabs.findIndex(t => t.path === path)
    }

    /**
     * 获取最后激活的标签页索引
     */
    function getLastActiveTabIndex(): number {
      const lastActiveTab = tabs.toSorted((a, b) => b.activeAt - a.activeAt)[0]
      return lastActiveTab ? findTabIndex(lastActiveTab.path) : -1
    }

    /**
     * 创建并插入新标签页的辅助函数
     */
    function createAndInsertTab(name: string, path: string, isPreview: boolean) {
      if (!currentProjectId) {
        return
      }

      const newTab: Tab = {
        name,
        path,
        activeAt: Date.now(),
        isPreview,
      }
      const insertIndex = activeTabIndex + 1
      currentProjectTabs.tabs.splice(insertIndex, 0, newTab)
      currentProjectTabs.activeTabIndex = insertIndex
    }

    /**
     * 请求聚焦编辑器
     * 使用延迟确保编辑器完全加载后再聚焦
     */
    function requestFocusEditor() {
      // 使用 setTimeout 延迟聚焦，确保编辑器完全渲染和挂载
      setTimeout(() => {
        const editorTextarea = document.querySelector('.monaco-editor textarea') as HTMLTextAreaElement
        if (editorTextarea) {
          editorTextarea.focus()
        }
      }, 100)
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

      // 如果标签页已存在，激活它；否则创建新标签页
      if (existIndex === -1) {
        createAndInsertTab(name, path, false)
      } else {
        activateTab(existIndex)
      }

      if (focus) {
        requestFocusEditor()
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
      if (!currentProjectId) {
        return
      }

      // 1. 检查标签页是否已存在
      const existIndex = findTabIndex(path)

      if (existIndex !== -1) {
        // 如果标签页已存在，激活它
        activateTab(existIndex)
        return
      }

      // 2. 检查当前激活的标签页是否为预览标签页
      if (activeTabIndex !== -1 && tabs[activeTabIndex].isPreview) {
        // 直接替换当前标签页
        currentProjectTabs.tabs[activeTabIndex] = {
          name,
          path,
          activeAt: Date.now(),
          isPreview: true,
        }
        return
      }

      // 3. 处理其他预览标签页
      const existingPreviewIndex = tabs.findIndex(tab => tab.isPreview)
      if (existingPreviewIndex !== -1) {
        // 移除旧的预览标签页
        currentProjectTabs.tabs.splice(existingPreviewIndex, 1)
        if (existingPreviewIndex < currentProjectTabs.activeTabIndex) {
          currentProjectTabs.activeTabIndex--
        }
      }

      // 4. 创建新的预览标签页
      createAndInsertTab(name, path, true)
    }

    /**
     * 将预览标签页转为普通标签页。
     */
    function fixPreviewTab(index: number) {
      if (!tabs[index]) {
        return
      }
      tabs[index].isPreview = false
    }

    /**
     * 激活指定标签页，并更新激活时间。
     */
    function activateTab(index: number) {
      if (!tabs[index]) {
        return
      }
      currentProjectTabs.activeTabIndex = index
      tabs[index].activeAt = Date.now()
    }

    /**
     * 关闭指定标签页。
     * 若关闭的是当前激活标签页，则激活最后使用的标签页。
     */
    function closeTab(index: number) {
      if (index < 0 || index >= tabs.length) {
        return
      }
      currentProjectTabs.tabs.splice(index, 1)
      if (index === activeTabIndex) {
        currentProjectTabs.activeTabIndex = getLastActiveTabIndex()
      } else if (index < activeTabIndex) {
        currentProjectTabs.activeTabIndex--
      }
    }

    /**
     * 更新标签页加载状态
     */
    function updateTabLoading(index: number, isLoading: boolean) {
      if (!tabs[index]) {
        return
      }
      tabs[index].isLoading = isLoading
    }

    /**
     * 更新标签页错误状态
     */
    function updateTabError(index: number, error?: string) {
      if (!tabs[index]) {
        return
      }
      tabs[index].error = error
    }

    /**
     * 更新标签页修改状态
     */
    function updateTabModified(index: number, isModified: boolean) {
      if (!tabs[index]) {
        return
      }
      tabs[index].isModified = isModified
      if (isModified && tabs[index].isPreview) {
        tabs[index].isPreview = false
      }
    }

    // 订阅文件系统事件
    fileSystemEvents.on('file:removed', (event) => {
      const index = findTabIndex(event.path)
      if (index !== -1) {
        closeTab(index)
      }
    })

    fileSystemEvents.on('file:renamed', async (event) => {
      const index = findTabIndex(event.oldPath)
      if (index !== -1) {
        tabs[index].path = event.newPath
        tabs[index].name = await basename(event.newPath)
      }
    })

    // 导出所有状态与方法
    return $$({
      tabs,
      activeTab,
      activeTabIndex,
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
