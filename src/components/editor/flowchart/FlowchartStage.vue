<script setup lang="ts">
import { Maximize, Plus, Redo2, Undo2, ZoomIn, ZoomOut } from '@lucide/vue'
import { getRectOfNodes, MarkerType, useVueFlow, VueFlow } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

import { useDragSession } from '~/composables/useDragSession'
import { useDroppableRegistry } from '~/composables/useDroppableRegistry'
import { AbsPath } from '~/domain/path'
import { findAvailableNodePosition } from '~/features/editor/flowchart/flowchart-node-placement'
import {
  FLOWCHART_NODE_CONTEXT_KEY,
  FLOWCHART_NODE_HEIGHT,
  FLOWCHART_NODE_WIDTH,
} from '~/features/editor/flowchart/flowchart-node-view'
import { resolveDroppedSceneRef } from '~/features/editor/flowchart/flowchart-scene'
import { useFlowchartTour } from '~/features/onboarding/useFlowchartTour'
import { gameSceneDir } from '~/services/platform/app-paths'
import { useModalStore } from '~/stores/modal'
import { useWorkspaceStore } from '~/stores/workspace'

import FlowchartManagerMenu from './FlowchartManagerMenu.vue'
import FlowchartNodeView from './FlowchartNodeView.vue'
import FlowchartSceneDock from './FlowchartSceneDock.vue'

import type { Connection, NodeDragEvent } from '@vue-flow/core'
import type { FlowchartNodeContext, FlowchartNodeViewData } from '~/features/editor/flowchart/flowchart-node-view'
import type { FlowchartWorkspace } from '~/features/editor/flowchart/useFlowchartWorkspace'
import type { DragPayload, FileSystemDragPayload } from '~/types/drag-drop'

interface Props {
  workspace: FlowchartWorkspace
}

const props = defineProps<Props>()

const {
  activeFlowchart,
  activeFlowchartId,
  addNode,
  addNodeFromScene,
  bindScene,
  canRedo,
  canUndo,
  connect,
  createBranch,
  deleteFlowchart,
  deleteSelection,
  flowcharts,
  moveNode,
  redo,
  renameFlowchart,
  renameNode,
  selectFlowchart,
  undo,
} = props.workspace

const workspaceStore = useWorkspaceStore()
const modalStore = useModalStore()
const dragSession = useDragSession()
const dropRegistry = useDroppableRegistry()

// 组件先于 <VueFlow> 调用 useVueFlow：它创建并注入画布状态，子组件复用同一实例
const {
  addSelectedNodes,
  findNode,
  fitView,
  getNodes,
  getSelectedEdges,
  getSelectedNodes,
  removeSelectedElements,
  screenToFlowCoordinate,
  setCenter,
  zoomIn,
  zoomOut,
} = useVueFlow()

const canvasRef = useTemplateRef<HTMLElement>('canvasRef')
const sceneDockRef = useTemplateRef<InstanceType<typeof FlowchartSceneDock>>('sceneDockRef')

const nodeTypes = { flowchart: markRaw(FlowchartNodeView) }

const scenePath = computed(() => {
  const gamePath = workspaceStore.currentGame?.path
  return gamePath ? gameSceneDir(AbsPath.from(gamePath)) : undefined
})

const nodes = computed(() => (activeFlowchart.value?.nodes ?? []).map(node => ({
  data: {
    isRoot: node.isRoot,
    scene: node.scene,
    title: node.title,
  } satisfies FlowchartNodeViewData,
  id: node.id,
  position: { ...node.position },
  type: 'flowchart',
})))

const edges = computed(() => (activeFlowchart.value?.edges ?? []).map(edge => ({
  id: edge.id,
  markerEnd: MarkerType.ArrowClosed,
  source: edge.source,
  target: edge.target,
  type: 'smoothstep',
})))

const FIT_VIEW_OPTIONS = { maxZoom: 1, padding: 0.4 } as const

let editingNodeId = $ref<string>()
let pendingNewNodeId: string | undefined
// 初始视图只居中，保持 100% 比例；自动适配会让节点大小取决于窗口尺寸。
let pendingCenter = $ref(true)

const { isActive: isTourActive } = useFlowchartTour({
  expandSceneDock: () => sceneDockRef.value!.expand(),
  ready: () => !pendingCenter,
})

const sceneDropTargetNodeId = computed(() => {
  const { isActive, currentPosition } = dragSession.state.value
  if (!isActive || !currentPosition
    || dropRegistry.hoveredTarget.value !== canvasRef.value
    || !dropRegistry.isDropAllowed.value) {
    return
  }

  return resolveNodeIdAt(currentPosition)
})

const nodeContext: FlowchartNodeContext = {
  beginTitleEdit: (nodeId) => {
    editingNodeId = nodeId
  },
  cancelTitleEdit: () => {
    editingNodeId = undefined
  },
  commitTitle: (nodeId, title) => {
    if (editingNodeId === nodeId) {
      editingNodeId = undefined
    }
    renameNode(nodeId, title)
  },
  deleteNode: nodeId => deleteSelection([nodeId], []),
  get sceneRootPath() {
    return scenePath.value ?? ''
  },
  isOnlySelectedNode: nodeId => getSelectedNodes.value.length === 1 && getSelectedNodes.value[0]?.id === nodeId,
  isSceneDropTarget: nodeId => sceneDropTargetNodeId.value === nodeId,
  isTitleEditing: nodeId => editingNodeId === nodeId,
  selectScene: (nodeId, scene) => {
    bindScene(nodeId, scene)
  },
}

provide(FLOWCHART_NODE_CONTEXT_KEY, nodeContext)

function selectNode(nodeId: string) {
  removeSelectedElements()
  const node = findNode(nodeId)
  if (node) {
    addSelectedNodes([node])
  }
}

function resolveNewNodePosition(preferred: { x: number, y: number }) {
  const occupied = (activeFlowchart.value?.nodes ?? []).map((node) => {
    const measured = findNode(node.id)?.dimensions
    return {
      ...node.position,
      width: Math.max(FLOWCHART_NODE_WIDTH, measured?.width ?? 0),
      height: Math.max(FLOWCHART_NODE_HEIGHT, measured?.height ?? 0),
    }
  })
  return findAvailableNodePosition(preferred, occupied)
}

function resolveViewportCenter(): { x: number, y: number } | undefined {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) {
    return
  }

  const point = screenToFlowCoordinate({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  return {
    x: Math.round(point.x - FLOWCHART_NODE_WIDTH / 2),
    y: Math.round(point.y - FLOWCHART_NODE_HEIGHT / 2),
  }
}

function handleAddNode() {
  const position = resolveViewportCenter()
  if (!position) {
    return
  }

  // 节点完成测量、变为可见后再编辑，避免输入框在隐藏时聚焦失败。
  pendingNewNodeId = addNode(resolveNewNodePosition(position))
}

function handleCreateBranch() {
  // 新支线的根节点固定在画布原点，切换后由初始视图居中。
  createBranch({ x: 0, y: 0 })
}

function handleConnect(connection: Connection) {
  connect(connection.source, connection.target)
}

function handleNodeDragStop({ node }: NodeDragEvent) {
  // 拖拽过程不写历史，落点确定后只提交一次可撤销变更
  moveNode(node.id, {
    x: Math.round(node.position.x),
    y: Math.round(node.position.y),
  })
}

function resolveNodeIdAt(position: { x: number, y: number }): string | undefined {
  const element = document.elementFromPoint(position.x, position.y)
  return element?.closest<HTMLElement>('[data-flowchart-node-id]')?.dataset.flowchartNodeId
}

function handleCanvasDrop(payload: DragPayload) {
  const root = scenePath.value
  const position = dragSession.state.value.currentPosition
  if (!root || !position) {
    return
  }

  const scene = resolveDroppedSceneRef(payload as FileSystemDragPayload, root)
  if (!scene) {
    return
  }

  const targetNodeId = resolveNodeIdAt(position)
  if (targetNodeId) {
    bindScene(targetNodeId, scene)
    return
  }

  const point = screenToFlowCoordinate(position)
  addNodeFromScene(resolveNewNodePosition({
    x: Math.round(point.x - FLOWCHART_NODE_WIDTH / 2),
    y: Math.round(point.y - FLOWCHART_NODE_HEIGHT / 2),
  }), scene)
}

function canDropScenePayload(payload: DragPayload): boolean {
  const root = scenePath.value
  return !!root && resolveDroppedSceneRef(payload as FileSystemDragPayload, root) !== undefined
}

watch(canvasRef, (element, previousElement) => {
  if (previousElement) {
    dropRegistry.unregisterDroppable(previousElement)
  }
  if (!element) {
    return
  }

  // droppable 只注册在画布容器上；画布浮层是它的兄弟节点，在浮层上松手不会落到画布
  dropRegistry.registerDroppable(element, {
    accept: 'file-system-item',
    canDrop: canDropScenePayload,
    id: 'flowchart-canvas',
    onDrop: handleCanvasDrop,
  })
}, { immediate: true })

onScopeDispose(() => {
  if (canvasRef.value) {
    dropRegistry.unregisterDroppable(canvasRef.value)
  }
})

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && target.closest('input, textarea, [contenteditable="true"]') !== null
}

function handleKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || isTourActive.value || modalStore.hasOpenModal || isEditableTarget(event.target)) {
    return
  }

  if (event.target instanceof HTMLElement && event.target.closest('[data-flowchart-scene-dock]')) {
    return
  }

  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase()
    if (key === 'z') {
      event.preventDefault()
      if (event.shiftKey) {
        redo()
      } else {
        undo()
      }
    } else if (key === 'y') {
      event.preventDefault()
      redo()
    }
    return
  }

  if (event.key !== 'Delete' && event.key !== 'Backspace') {
    return
  }

  const nodeIds = getSelectedNodes.value
    .filter(node => node.data?.isRoot !== true)
    .map(node => node.id)
  const edgeIds = getSelectedEdges.value.map(edge => edge.id)
  if (nodeIds.length === 0 && edgeIds.length === 0) {
    return
  }

  event.preventDefault()
  deleteSelection(nodeIds, edgeIds)
}

useEventListener(globalThis, 'keydown', handleKeydown)

async function centerPendingView() {
  await nextTick()
  const measuredNodes = getNodes.value
  if (measuredNodes.some(node => node.dimensions.width === 0 || node.dimensions.height === 0)) {
    return
  }

  const bounds = getRectOfNodes(measuredNodes)
  const centered = await setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { zoom: 1 })
  if (centered) {
    pendingCenter = false
  }
}

function handleNodesInitialized() {
  if (pendingCenter) {
    void centerPendingView()
  }
  if (pendingNewNodeId) {
    selectNode(pendingNewNodeId)
    editingNodeId = pendingNewNodeId
    pendingNewNodeId = undefined
  }
}

watch(activeFlowchartId, () => {
  editingNodeId = undefined
  pendingNewNodeId = undefined
  pendingCenter = true
  void centerPendingView()
})
</script>

<template>
  <div class="h-full w-full relative overflow-hidden">
    <div ref="canvasRef" :class="$style.canvas" class="h-full w-full">
      <VueFlow
        :nodes="nodes"
        :edges="edges"
        :node-types="nodeTypes"
        :delete-key-code="null"
        :min-zoom="0.2"
        :max-zoom="2"
        data-testid="flowchart-canvas"
        @connect="handleConnect"
        @node-drag-stop="handleNodeDragStop"
        @nodes-initialized="handleNodesInitialized"
      />
    </div>

    <div class="flex flex-wrap gap-2 pointer-events-none items-start left-3 right-3 top-3 justify-between absolute">
      <div class="pointer-events-auto" data-tour="flowchart-manager">
        <FlowchartManagerMenu
          :active-flowchart-id="activeFlowchartId"
          :flowcharts="flowcharts"
          @create="handleCreateBranch"
          @delete="deleteFlowchart"
          @rename="renameFlowchart"
          @select="selectFlowchart"
        />
      </div>

      <div class="ml-auto px-0.5 py-0.5 border rounded-md bg-background/95 flex shrink-0 gap-0.5 pointer-events-auto shadow-md backdrop-blur" data-tour="flowchart-toolbar">
        <Button
          variant="ghost"
          size="sm"
          data-testid="flowchart-add-node"
          data-tour="flowchart-add-node"
          @click="handleAddNode"
        >
          <Plus />
          {{ $t('edit.flowchart.canvas.addNode') }}
        </Button>

        <Separator orientation="vertical" class="mx-0.5 my-auto h-6" />

        <Tooltip :delay-duration="500">
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground"
              :disabled="!canUndo"
              :aria-label="$t('edit.flowchart.canvas.undo')"
              @click="undo"
            >
              <Undo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" class="px-2 py-1">
            {{ $t('edit.flowchart.canvas.undo') }}
          </TooltipContent>
        </Tooltip>
        <Tooltip :delay-duration="500">
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground"
              :disabled="!canRedo"
              :aria-label="$t('edit.flowchart.canvas.redo')"
              @click="redo"
            >
              <Redo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" class="px-2 py-1">
            {{ $t('edit.flowchart.canvas.redo') }}
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" class="mx-0.5 my-auto h-6" />

        <Tooltip :delay-duration="500">
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon-sm" class="text-muted-foreground" :aria-label="$t('edit.flowchart.canvas.zoomIn')" @click="zoomIn()">
              <ZoomIn />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" class="px-2 py-1">
            {{ $t('edit.flowchart.canvas.zoomIn') }}
          </TooltipContent>
        </Tooltip>
        <Tooltip :delay-duration="500">
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon-sm" class="text-muted-foreground" :aria-label="$t('edit.flowchart.canvas.zoomOut')" @click="zoomOut()">
              <ZoomOut />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" class="px-2 py-1">
            {{ $t('edit.flowchart.canvas.zoomOut') }}
          </TooltipContent>
        </Tooltip>
        <Tooltip :delay-duration="500">
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon-sm" class="text-muted-foreground" :aria-label="$t('edit.flowchart.canvas.fitView')" @click="fitView(FIT_VIEW_OPTIONS)">
              <Maximize />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" class="px-2 py-1">
            {{ $t('edit.flowchart.canvas.fitView') }}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>

    <FlowchartSceneDock ref="sceneDockRef" class="bottom-3 left-3 absolute" />
  </div>
</template>

<style module>
.canvas {
  background-image: radial-gradient(circle, oklch(var(--border) / 65%) 1px, transparent 1px);
  background-size: 20px 20px;
}
</style>
