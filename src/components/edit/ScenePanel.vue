<script setup lang="ts">
import { join } from '@tauri-apps/api/path'
import { File, FilePen, FilePlus, Folder, FolderOpen, FolderPlus, Layers } from 'lucide-vue-next'
import { TreeItem, TreeRoot, TreeVirtualizer } from 'reka-ui'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip'
import { useFileStore } from '~/stores/file'
import { useTabsStore } from '~/stores/tabs'
import { useWorkspaceStore } from '~/stores/workspace'

import type { FlattenedItem } from 'reka-ui'

const fileStore = useFileStore()
const workspaceStore = useWorkspaceStore()
const tabsStore = useTabsStore()

interface TreeNode {
  id: string
  title: string
  path: string
  children?: TreeNode[]
}

// 计算场景文件夹的完整路径
const scenePath = computedAsync(async () => {
  if (!workspaceStore.currentGame?.path) {
    return ''
  }
  const path = await join(workspaceStore.currentGame.path, 'game', 'scene')
  return path
})

// 递归获取文件夹内容，返回嵌套结构
async function getAllFolderContents(path: string): Promise<TreeNode[]> {
  try {
    const contents = await fileStore.getFolderContents(path)

    // 使用 Promise.all 并行处理所有项目
    const nodes = await Promise.all(
      contents.map(async item => ({
        id: item.id,
        title: item.name,
        path: item.path,
        children: item.isDir ? await getAllFolderContents(item.path) : undefined,
      })),
    )

    return nodes
  } catch (error) {
    console.error('🔍️ > getAllFolderContents > error:', error)
    throw error
  }
}

// 初始加载场景文件夹内容
const items = computedAsync(async () => {
  const path = scenePath.value
  if (!path) {
    return []
  }
  return await getAllFolderContents(path)
})

const handleClick = async (item: FlattenedItem<Record<string, unknown>>) => {
  const { hasChildren, value: { path, title: name } } = item as unknown as FlattenedItem<TreeNode>
  if (hasChildren) {
    return
  }
  tabsStore.openPreviewTab(name, path)
}

const handleDoubleClick = async (item: FlattenedItem<Record<string, unknown>>) => {
  const { hasChildren, value: { path } } = item as unknown as FlattenedItem<TreeNode>
  if (hasChildren) {
    return
  }
  const index = tabsStore.findTabIndex(path)
  const tab = tabsStore.tabs[index]
  if (tab.isPreview) {
    tabsStore.fixPreviewTab(index)
  }
}

// 创建新文件
const handleCreateFile = async () => {
  if (!scenePath.value) {
    return
  }
  // TODO: 实现文件创建逻辑
  console.log('创建新文件')
}

// 创建新文件夹
const handleCreateFolder = async () => {
  if (!scenePath.value) {
    return
  }
  // TODO: 实现文件夹创建逻辑
  console.log('创建新文件夹')
}
</script>

<template>
  <div class="group/scene rounded flex flex-col h-full divide-y">
    <div class="px-2 py-1 flex items-center justify-between">
      <h3 class="text-sm font-medium flex items-center">
        <Layers class="mr-2 h-4 w-4" />
        场景
      </h3>
      <div class="opacity-0 flex gap-1 transition-opacity group-hover/scene:opacity-100">
        <Button variant="ghost" size="icon" class="rounded h-6 w-6" @click="handleCreateFile">
          <FilePlus class="h-4 w-4" :stroke-width="1.5" />
        </Button>
        <Button variant="ghost" size="icon" class="rounded h-6 w-6" @click="handleCreateFolder">
          <FolderPlus class="h-4 w-4" :stroke-width="1.5" />
        </Button>
      </div>
    </div>
    <ScrollArea class="flex-1">
      <TreeRoot
        :items="items"
        :get-key="(item) => item.title"
        class="text-13px px-2 py-1 list-none select-none"
      >
        <TooltipProvider :skip-delay-duration="0" :ignore-non-keyboard-focus="true">
          <TreeVirtualizer
            v-slot="{ item }"
            :text-content="(opt) => opt.name"
            :estimate-size="26"
          >
            <Tooltip>
              <TooltipTrigger as-child>
                <TreeItem
                  v-slot="{ isExpanded }"
                  :key="item._id"
                  v-bind="item.bind"
                  :style="{ 'padding-left': `${item.level - 0.5}rem` }"
                  class="group/item leading-6 px-2 py-1px outline-none rounded flex w-full cursor-pointer transition-colors duration-200 items-center data-[selected]:bg-gray-200 hover:bg-gray-100 data-[selected]:hover:bg-gray-200"
                  @click="handleClick(item)"
                  @dblclick="handleDoubleClick(item)"
                >
                  <template v-if="item.hasChildren">
                    <Folder v-if="!isExpanded" class="text-gray-500 shrink-0 h-4 w-4" />
                    <FolderOpen v-else class="text-blue-500 shrink-0 h-4 w-4" />
                  </template>
                  <File v-else class="text-gray-500 shrink-0 h-4 w-4" />
                  <div class="text-gray-700 pl-1.5 whitespace-nowrap text-ellipsis overflow-hidden">
                    {{ item.value.title }}
                  </div>
                </TreeItem>
              </TooltipTrigger>
              <TooltipContent :disabled-portal="true">
                <p>{{ item.value.path }}</p>
              </TooltipContent>
            </Tooltip>
          </TreeVirtualizer>
        </TooltipProvider>
      </TreeRoot>
    </ScrollArea>
  </div>
</template>
