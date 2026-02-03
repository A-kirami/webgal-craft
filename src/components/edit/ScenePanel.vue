<script setup lang="ts">
import { dirname, join } from '@tauri-apps/api/path'
import { CopyMinus, FilePlus, FolderPlus, Layers, RotateCw } from 'lucide-vue-next'

import type { FlattenedItem } from 'reka-ui'

const fileStore = useFileStore()
const workspaceStore = useWorkspaceStore()
const tabsStore = useTabsStore()
const fileSystemEvents = useFileSystemEvents()

interface TreeNode {
  id: string
  name: string
  path: string
  children?: TreeNode[]
}

const scenePath = computedAsync(async () => {
  if (!workspaceStore.currentGame?.path) {
    return ''
  }
  return await join(workspaceStore.currentGame.path, 'game', 'scene')
})

async function getAllFolderContents(path: string): Promise<TreeNode[]> {
  try {
    const contents = await fileStore.getFolderContents(path)

    const nodes = await Promise.all(
      contents.map(async item => ({
        id: item.id,
        name: item.name,
        path: item.path,
        children: item.isDir ? await getAllFolderContents(item.path) : undefined,
      })),
    )

    return nodes
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '获取场景文件夹内容失败'
    void logger.error(`[ScenePanel] 获取场景文件夹内容失败: ${errorMessage}`)
    throw error
  }
}

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
    return await getAllFolderContents(path)
  } finally {
    if (!isSilent) {
      isLoading = false
    }
  }
})

function handleClick(item: FlattenedItem<TreeNode>) {
  if (item.hasChildren) {
    return
  }
  const { name, path } = item.value
  tabsStore.openPreviewTab(name, path)
}

function handleDoubleClick(item: FlattenedItem<TreeNode>) {
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

let selectedItem = $ref<TreeNode>()

function findNodeByPath(nodes: TreeNode[], targetPath: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return node
    }
    if (node.children) {
      const found = findNodeByPath(node.children, targetPath)
      if (found) {
        return found
      }
    }
  }
  return undefined
}

function updateSelectedItemFromActiveTab() {
  const activeTab = tabsStore.activeTab
  if (!activeTab) {
    selectedItem = undefined
    return
  }

  const foundNode = findNodeByPath(items.value || [], activeTab.path)
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

async function getTargetPath(): Promise<string | undefined> {
  const rootPath = scenePath.value
  if (!rootPath) {
    return undefined
  }

  const selected = selectedItem
  if (!selected) {
    return rootPath
  }

  // 当用户选中文件时，默认在其父目录下创建新条目，以匹配主流编辑器的交互预期
  return ('children' in selected && selected.children !== undefined)
    ? selected.path
    : await dirname(selected.path)
}

async function handleCreateFile() {
  const targetPath = await getTargetPath()
  if (targetPath) {
    fileTreeRef?.startCreating(targetPath, 'file')
  }
}

async function handleCreateFolder() {
  const targetPath = await getTargetPath()
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
      <h3 class="text-sm font-medium flex items-center">
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
    />
  </div>
</template>
