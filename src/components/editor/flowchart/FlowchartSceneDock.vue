<script setup lang="ts">
import { ChevronDown, ChevronUp, CopyMinus, Layers, RotateCw } from '@lucide/vue'

import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { AbsPath } from '~/domain/path'
import { loadScenePanelTreeNodes } from '~/features/editor/scene-panel/scene-panel'
import { gameSceneDir } from '~/services/platform/app-paths'
import { useFileStore } from '~/stores/file'
import { useWorkspaceStore } from '~/stores/workspace'

import type { ScenePanelTreeNode } from '~/features/editor/scene-panel/scene-panel'

const fileStore = useFileStore()
const workspaceStore = useWorkspaceStore()
const fileSystemEvents = useFileSystemEvents()

const fileTreeRef = useTemplateRef<{ collapseAll: () => void }>('fileTreeRef')

// 必须同步更新：工作区清空时 items 会在同一轮读取 scenePath，异步结果会拿到上一个工程的路径
const scenePath = computed(() => {
  const gamePath = workspaceStore.currentGame?.path
  return gamePath ? gameSceneDir(AbsPath.from(gamePath)) : ''
})

let isCollapsed = $ref(false)
let isLoading = $ref(false)
let items = $ref<ScenePanelTreeNode[]>()

let loadGeneration = 0

// 手动维护加载态：刷新、文件系统事件和工作区切换共用一次读取，旧读取的结果直接丢弃
async function loadTree() {
  const generation = ++loadGeneration
  const path = scenePath.value
  if (!path) {
    items = []
    isLoading = false
    return
  }

  isLoading = true
  try {
    await fileStore.initialized
    if (generation !== loadGeneration) {
      return
    }
    const loadedItems = await loadScenePanelTreeNodes(path, currentPath => fileStore.getFolderContents(AbsPath.from(currentPath)))
    if (generation === loadGeneration) {
      items = loadedItems
    }
  } catch (error) {
    logger.error(`[flowchart] 读取场景目录失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    if (generation === loadGeneration) {
      isLoading = false
    }
  }
}

watch(scenePath, () => {
  void loadTree()
}, { immediate: true })

function handleCollapseAll() {
  fileTreeRef.value?.collapseAll()
}

function expand() {
  isCollapsed = false
}

defineExpose({ expand })

const debouncedRefresh = useDebounceFn(() => {
  void loadTree()
}, 100)

const stopFsListeners = ([
  'file:created', 'file:removed', 'file:renamed',
  'directory:created', 'directory:modified', 'directory:removed', 'directory:renamed',
] as const).map(event => fileSystemEvents.on(event, debouncedRefresh))
onScopeDispose(() => {
  for (const stop of stopFsListeners) {
    stop()
  }
})
</script>

<template>
  <section
    class="border rounded-lg bg-background/95 flex flex-col w-[300px] shadow-md transition-[height] duration-200 ease-out overflow-hidden backdrop-blur motion-reduce:transition-none"
    :class="isCollapsed ? 'h-9' : 'h-[clamp(240px,50%,480px)]'"
    data-flowchart-scene-dock
    data-testid="flowchart-scene-dock"
    data-tour="flowchart-scenes"
  >
    <header class="px-2 flex shrink-0 gap-1 h-9 items-center">
      <Layers class="text-muted-foreground shrink-0 size-4" aria-hidden="true" />
      <h2 class="text-xs font-medium truncate">
        {{ $t('edit.flowchart.sceneDock.title') }}
      </h2>
      <div v-if="!isCollapsed" class="ml-auto flex gap-0.5 items-center">
        <Button
          variant="ghost"
          size="icon-xs"
          class="text-muted-foreground rounded"
          :disabled="isLoading"
          :aria-label="$t('edit.flowchart.sceneDock.refresh')"
          @click="loadTree"
        >
          <RotateCw />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          class="text-muted-foreground rounded"
          :aria-label="$t('edit.flowchart.sceneDock.collapseAll')"
          @click="handleCollapseAll"
        >
          <CopyMinus />
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        class="text-muted-foreground rounded"
        :class="isCollapsed ? 'ml-auto' : 'ml-1'"
        :aria-expanded="!isCollapsed"
        :aria-label="isCollapsed ? $t('edit.flowchart.sceneDock.expand') : $t('edit.flowchart.sceneDock.collapse')"
        data-testid="flowchart-scene-dock-toggle"
        @click="isCollapsed = !isCollapsed"
      >
        <ChevronDown v-if="isCollapsed" />
        <ChevronUp v-else />
      </Button>
    </header>

    <div class="flex-1 min-h-0" :inert="isCollapsed">
      <p
        v-if="items && items.length === 0"
        class="text-xs text-muted-foreground px-2 py-3"
      >
        {{ $t('edit.flowchart.sceneDock.empty') }}
      </p>
      <FileTree
        v-else-if="items"
        ref="fileTreeRef"
        :items="items"
        :is-loading="isLoading"
        :get-key="(item: ScenePanelTreeNode) => item.path"
        :enable-context-menu="false"
        :enable-tooltip="false"
        :root-path="scenePath"
        enable-drag-source
      />
      <p v-else class="text-xs text-muted-foreground px-2 py-3">
        {{ $t('edit.flowchart.sceneDock.loading') }}
      </p>
    </div>
  </section>
</template>
