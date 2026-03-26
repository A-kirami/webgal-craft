<script setup lang="ts">
import { dirname } from '@tauri-apps/api/path'
import { CopyMinus, FilePlus, FolderPlus, Layers, RotateCw } from 'lucide-vue-next'

import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import {
  findScenePanelNodeByPath,
  loadScenePanelTreeNodes,
  resolveScenePanelTargetPath,
} from '~/features/editor/scene-panel/scene-panel'
import { gameSceneDir } from '~/services/platform/app-paths'
import { useFileStore } from '~/stores/file'
import { useTabsStore } from '~/stores/tabs'
import { useWorkspaceStore } from '~/stores/workspace'

import type { FlattenedItem } from 'reka-ui'
import type { ScenePanelTreeNode } from '~/features/editor/scene-panel/scene-panel'

const fileStore = useFileStore()
const workspaceStore = useWorkspaceStore()
const tabsStore = useTabsStore()
const fileSystemEvents = useFileSystemEvents()

const scenePath = computedAsync(async () => {
  if (!workspaceStore.currentGame?.path) {
    return ''
  }
  return await gameSceneDir(workspaceStore.currentGame.path)
})

let itemsKey = $ref(0)
let isLoading = $ref(false)
// 刷新模式队列：true 表示静默刷新，false 或 undefined 表示普通刷新
let refreshModes = $ref<boolean[]>([])

const items = computedAsync(async () => {
  // 按触发顺序消费一次刷新模式；默认视为普通刷新，避免并发覆盖刷新语义
  const mode = refreshModes.shift()
  const isSilent = mode === true

  if (!isSilent) {
    isLoading = true
  }
  try {
    const path = scenePath.value
    if (!path) {
      return []
    }
    // 使用 itemsKey 作为无意义依赖，强制触发 computedAsync 重新计算
    void itemsKey
    return await loadScenePanelTreeNodes(path, async currentPath => await fileStore.getFolderContents(currentPath))
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '获取场景文件夹内容失败'
    void logger.error(`[ScenePanel] 获取场景文件夹内容失败: ${errorMessage}`)
    throw error
  } finally {
    if (!isSilent) {
      isLoading = false
    }
  }
})

function handleClick(item: FlattenedItem<ScenePanelTreeNode>) {
  if (item.hasChildren) {
    return
  }
  const { name, path } = item.value
  tabsStore.openTab(name, path)
}

function handleDoubleClick(item: FlattenedItem<ScenePanelTreeNode>) {
  if (item.hasChildren) {
    return
  }
  const { path } = item.value
  const index = tabsStore.findTabIndex(path)
  const tab = tabsStore.tabs[index]
  if (tab.isPreview) {
    tabsStore.fixPreviewTab(index)
  }
}

function handleAuxClick(item: FlattenedItem<ScenePanelTreeNode>) {
  if (item.hasChildren) {
    return
  }
  const { name, path } = item.value
  tabsStore.openTab(name, path, { forceNormal: true })
}

let selectedItem = $ref<ScenePanelTreeNode>()

function updateSelectedItemFromActiveTab() {
  const activeTab = tabsStore.activeTab
  if (!activeTab) {
    selectedItem = undefined
    return
  }

  const foundNode = findScenePanelNodeByPath(items.value || [], activeTab.path)
  if (foundNode) {
    selectedItem = foundNode
  }
}

const fileTreeRef = $(useTemplateRef('fileTreeRef'))

function scrollToSelectedItem() {
  const viewport = fileTreeRef?.getViewportElement()
  if (!viewport) {
    return
  }

  const selectedElement = viewport.querySelector('[data-selected]') as HTMLElement
  if (!selectedElement) {
    return
  }

  const viewportRect = viewport.getBoundingClientRect()
  const selectedRect = selectedElement.getBoundingClientRect()

  const isVisible = selectedRect.top >= viewportRect.top && selectedRect.bottom <= viewportRect.bottom

  if (!isVisible) {
    selectedElement.scrollIntoView({
      block: 'center',
      behavior: 'auto',
    })
  }
}

watch($$(selectedItem), () => {
  if (selectedItem) {
    nextTick(() => {
      scrollToSelectedItem()
    })
  }
})

watch(() => tabsStore.activeTab, updateSelectedItemFromActiveTab)

watch(items, () => {
  if (items.value?.length) {
    updateSelectedItemFromActiveTab()
  }
})

async function handleCreateFile() {
  const targetPath = await resolveScenePanelTargetPath(scenePath.value, selectedItem, dirname)
  if (targetPath) {
    fileTreeRef?.startCreating(targetPath, 'file')
  }
}

async function handleCreateFolder() {
  const targetPath = await resolveScenePanelTargetPath(scenePath.value, selectedItem, dirname)
  if (targetPath) {
    fileTreeRef?.startCreating(targetPath, 'folder')
  }
}

function handleRefresh() {
  refreshModes.push(false)
  itemsKey++
}

function handleCollapseAll() {
  fileTreeRef?.collapseAll()
}

// 监听文件系统事件，自动刷新数据（静默刷新，不显示加载状态）
const debouncedRefresh = useDebounceFn(() => {
  refreshModes.push(true)
  itemsKey++
}, 100)

fileSystemEvents.on('file:created', debouncedRefresh)
fileSystemEvents.on('file:removed', debouncedRefresh)
fileSystemEvents.on('file:renamed', debouncedRefresh)
fileSystemEvents.on('directory:created', debouncedRefresh)
fileSystemEvents.on('directory:removed', debouncedRefresh)
fileSystemEvents.on('directory:renamed', debouncedRefresh)
</script>

<template>
  <div class="group/scene rounded flex flex-col h-full divide-y">
    <div class="px-2 py-1 flex items-center justify-between">
      <h3 class="text-sm font-medium flex text-nowrap items-center">
        <Layers class="mr-2 shrink-0 h-4 w-4" />
        {{ $t('edit.scenePanel.scene') }}
      </h3>
      <div class="opacity-0 flex gap-1 transition-opacity group-hover/scene:opacity-100">
        <Button variant="ghost" size="icon" class="rounded h-6 w-6" @click="handleCreateFile">
          <FilePlus class="h-4 w-4" :stroke-width="1.5" />
        </Button>
        <Button variant="ghost" size="icon" class="rounded h-6 w-6" @click="handleCreateFolder">
          <FolderPlus class="h-4 w-4" :stroke-width="1.5" />
        </Button>
        <Button variant="ghost" size="icon" class="rounded h-6 w-6" :disabled="isLoading" @click="handleRefresh">
          <RotateCw class="h-4 w-4" :stroke-width="1.5" />
        </Button>
        <Button variant="ghost" size="icon" class="rounded h-6 w-6" @click="handleCollapseAll">
          <CopyMinus class="h-4 w-4" :stroke-width="1.5" />
        </Button>
      </div>
    </div>
    <FileTree
      v-if="items"
      ref="fileTreeRef"
      ::selected-item="selectedItem"
      :items="items"
      :get-key="(item) => item.path"
      open-created-file-in-tab
      :enable-tooltip="false"
      :tooltip-content="(item) => item.value.path"
      :is-loading="isLoading"
      tree-name="scene"
      default-file-name=".txt"
      @click="handleClick"
      @dblclick="handleDoubleClick"
      @auxclick="handleAuxClick"
    />
  </div>
</template>
