<script setup lang="ts">
import { CopyMinus, FilePlus, FolderPlus, Layers, RotateCw } from '@lucide/vue'

import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { AbsPath } from '~/domain/path'
import {
  findScenePanelNodeByPath,
  loadScenePanelTreeNodes,
  resolveScenePanelTargetPath,
} from '~/features/editor/scene-panel/scene-panel'
import { gameSceneDir } from '~/services/platform/app-paths'
import { useEditorDiagnosticsStore } from '~/stores/editor-diagnostics'
import { useFileStore } from '~/stores/file'
import { useTabsStore } from '~/stores/tabs'
import { useWorkspaceStore } from '~/stores/workspace'

import type { FlattenedItem } from 'reka-ui'
import type { DiagnosticSeverity } from '~/features/editor/diagnostics/types'
import type { ScenePanelTreeNode } from '~/features/editor/scene-panel/scene-panel'

const fileStore = useFileStore()
const diagnosticsStore = useEditorDiagnosticsStore()
const workspaceStore = useWorkspaceStore()
const tabsStore = useTabsStore()
const fileSystemEvents = useFileSystemEvents()

const scenePath = computedAsync(async () => {
  const gamePath = workspaceStore.currentGame?.path
  return gamePath ? gameSceneDir(AbsPath.from(gamePath)) : ''
})

let isLoading = $ref(false)
let refreshTrigger = $ref({ count: 0, silent: false })

const items = computedAsync(async () => {
  const { silent: isSilent } = refreshTrigger

  if (!isSilent) {
    isLoading = true
  }
  // computedAsync 仅在首个 await 之前同步收集依赖，所以 refreshTrigger、scenePath、initialized
  // 这三处响应式访问必须放在任何 await 之前，否则手动刷新与文件系统事件无法触发重算
  const path = scenePath.value
  const initialized = fileStore.initialized
  try {
    if (!path) {
      return []
    }
    // 等待 FileStore 初始化完成，避免在 enginePath 未就绪时加载
    await initialized
    return await loadScenePanelTreeNodes(path, currentPath => fileStore.getFolderContents(AbsPath.from(currentPath)))
  } catch (error) {
    logger.error(`[ScenePanel] 获取场景文件夹内容失败: ${error instanceof Error ? error.message : error}`)
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
  tabsStore.openTab(name, AbsPath.from(path))
}

function getSceneItemDiagnosticSeverity(item: ScenePanelTreeNode): DiagnosticSeverity | undefined {
  if (item.children) {
    return
  }
  return diagnosticsStore.getHighestSeverity(AbsPath.from(item.path))
}

function handleDoubleClick(item: FlattenedItem<ScenePanelTreeNode>) {
  if (item.hasChildren) {
    return
  }
  const { path } = item.value
  const index = tabsStore.findTabIndex(AbsPath.from(path))
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
  tabsStore.openTab(name, AbsPath.from(path), { forceNormal: true })
}

let selectedItem = $ref<ScenePanelTreeNode>()
let pendingRevealPath = $ref<string>()
let lastSyncedActiveTabPath = $ref(tabsStore.activeTab?.path)
let hasLoadedSceneItems = $ref(false)

function updateSelectedItemFromActiveTab() {
  const activeTab = tabsStore.activeTab
  if (!activeTab) {
    selectedItem = undefined
    pendingRevealPath = undefined
    lastSyncedActiveTabPath = undefined
    return
  }

  const foundNode = findScenePanelNodeByPath(items.value || [], activeTab.path)
  if (!foundNode) {
    lastSyncedActiveTabPath = activeTab.path
    pendingRevealPath = undefined
    return
  }

  selectedItem = foundNode
  lastSyncedActiveTabPath = activeTab.path
  if (pendingRevealPath === foundNode.path) {
    pendingRevealPath = undefined
    nextTick(scrollToSelectedItem)
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

watch(() => tabsStore.activeTab?.path, (path) => {
  pendingRevealPath = hasLoadedSceneItems && path && path !== lastSyncedActiveTabPath ? path : undefined
  updateSelectedItemFromActiveTab()
})

watch(items, () => {
  if (items.value?.length) {
    hasLoadedSceneItems = true
    updateSelectedItemFromActiveTab()
  }
})

async function handleCreateFile() {
  const targetPath = await resolveScenePanelTargetPath(scenePath.value, selectedItem)
  if (targetPath) {
    fileTreeRef?.startCreating(targetPath, 'file')
  }
}

async function handleCreateFolder() {
  const targetPath = await resolveScenePanelTargetPath(scenePath.value, selectedItem)
  if (targetPath) {
    fileTreeRef?.startCreating(targetPath, 'folder')
  }
}

function handleRefresh() {
  refreshTrigger = { count: refreshTrigger.count + 1, silent: false }
}

function handleCollapseAll() {
  fileTreeRef?.collapseAll()
}

// 监听文件系统事件，自动刷新数据（静默刷新，不显示加载状态）
const debouncedRefresh = useDebounceFn(() => {
  refreshTrigger = { count: refreshTrigger.count + 1, silent: true }
}, 100)

const fsRefreshEvents = [
  'file:created', 'file:removed', 'file:renamed',
  'directory:created', 'directory:modified', 'directory:removed', 'directory:renamed',
] as const

const stopFsListeners = fsRefreshEvents.map(event => fileSystemEvents.on(event, debouncedRefresh))
onScopeDispose(() => {
  for (const stop of stopFsListeners) {
    stop()
  }
})
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
        <Button variant="ghost" size="icon" class="rounded h-6 w-6" :disabled="isLoading" data-testid="scene-panel-refresh" @click="handleRefresh">
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
      :item-severity="getSceneItemDiagnosticSeverity"
      :get-key="(item) => item.path"
      open-created-file-in-tab
      :enable-tooltip="false"
      :tooltip-content="(item) => item.value.path"
      :is-loading="isLoading"
      tree-name="scene"
      enable-drag-transfer
      :root-path="scenePath"
      :default-file-name-parts="{ stem: '', extension: '.txt' }"
      @click="handleClick"
      @dblclick="handleDoubleClick"
      @auxclick="handleAuxClick"
    />
  </div>
</template>
