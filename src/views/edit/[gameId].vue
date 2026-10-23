<script setup lang="ts">
import FlowchartEditor from '~/components/editor/flowchart/FlowchartEditor.vue'
import { ResizablePanel } from '~/components/ui/resizable'
import { useAnimationTableSyncBootstrap } from '~/features/editor/animation/useAnimationTableSyncBootstrap'
import { querySentenceResourceReferences } from '~/features/editor/command-registry/diagnostics'
import { useEffectEditorProvider } from '~/features/editor/effect-editor/useEffectEditorProvider'
import { useFlowchartWorkspace } from '~/features/editor/flowchart/useFlowchartWorkspace'
import { EDITOR_LEAVE_HOOK_KEY } from '~/features/editor/leave-hook'
import { useExternalPreviewReadySync } from '~/features/editor/preview/useExternalPreviewReadySync'
import { createEditorShortcutDefinitions } from '~/features/editor/shortcut/definitions'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useShortcutDispatcher } from '~/features/editor/shortcut/useShortcutDispatcher'
import { TRANSFORM_OVERLAY_BRIDGE_KEY } from '~/features/editor/transform-overlay/context'
import { useTransformOverlayBridge } from '~/features/editor/transform-overlay/useTransformOverlayBridge'
import {
  isRuntimeRebindRequired,
  requestGameRuntimeRebind,
  resolveRuntimeRebindIssue,
} from '~/features/modals/import-dependency-resolution/request-game-runtime-rebind'
import { requestImportDependencyResolution } from '~/features/modals/import-dependency-resolution/request-import-dependency-resolution'
import { useEditorTour } from '~/features/onboarding/useEditorTour'
import { useEditorWorkspaceTour } from '~/features/onboarding/useEditorWorkspaceTour'
import { useEffectEditorTour } from '~/features/onboarding/useEffectEditorTour'
import { useResourceSwitchTour } from '~/features/onboarding/useResourceSwitchTour'
import { useSidebarCollapseTour } from '~/features/onboarding/useSidebarCollapseTour'
import { gameManager } from '~/services/game-manager'
import { useResourceIndexBootstrap } from '~/services/resource-index/service'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { useFileStore } from '~/stores/file'
import { useModalStore } from '~/stores/modal'
import { usePreferenceStore } from '~/stores/preference'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'

import type { EditorViewMode } from '~/features/editor/view-mode'

interface EditorPanelHandle {
  expandCommandPanel?: () => void
  toggleCommandPanel?: () => void
}

const editorStore = useEditorStore()
useFileStore()
const modalStore = useModalStore()
const preferenceStore = usePreferenceStore()
const workspaceStore = useWorkspaceStore()
const router = useRouter()
const editorPanelRef = useTemplateRef<EditorPanelHandle>('editorPanel')

// 编辑页局部视图状态：进入编辑页、刷新或切换项目都回到场景视图
let viewMode = $ref<EditorViewMode>('scene')
const flowchartWorkspace = useFlowchartWorkspace({
  gamePath: computed(() => workspaceStore.currentGame?.path),
})
const effectEditorProvider = useEffectEditorProvider()
const transformOverlayBridge = useTransformOverlayBridge({
  provider: effectEditorProvider,
})

provide(TRANSFORM_OVERLAY_BRIDGE_KEY, transformOverlayBridge)

// 流程图自动保存有防抖窗口，离开页面前必须把它写入完成，否则工作区上下文已被替换
provide(EDITOR_LEAVE_HOOK_KEY, {
  flush: () => flowchartWorkspace.flush(),
})

async function flushBeforeNavigation() {
  try {
    await flowchartWorkspace.flush()
  } catch (error) {
    handleError(error)
    return false
  }
}

onBeforeRouteLeave(flushBeforeNavigation)
onBeforeRouteUpdate(flushBeforeNavigation)

let pendingEditExit: Promise<void> | undefined

function exitEditMode(): Promise<void> {
  pendingEditExit ??= router.replace('/').then(() => undefined)
  return pendingEditExit
}

useAnimationTableSyncBootstrap()
useExternalPreviewReadySync()
useResourceIndexBootstrap(querySentenceResourceReferences)

useEditorTour()

useEditorWorkspaceTour({
  expandCommandPanel: () => editorPanelRef.value?.expandCommandPanel?.(),
})

useEffectEditorTour({
  enabled: () => transformOverlayBridge.enabled.value,
  hasInteracted: () => transformOverlayBridge.hasOverlayInteraction.value,
})

useResourceSwitchTour()

useSidebarCollapseTour()

// 进入工作区时即时校验：失效则进入阻断式恢复弹窗，由用户决定重试 / 重链接 / 返回主页
watch(() => workspaceStore.currentGame?.id, () => {
  viewMode = 'scene'
})

watch(() => workspaceStore.currentGame?.id, async (gameId) => {
  if (!gameId) {
    return
  }
  const ok = await workspaceStore.ensureCurrentGameAvailable()
  // await 期间用户可能已切换到其他游戏，避免对新游戏误开恢复弹窗
  if (workspaceStore.currentGame?.id !== gameId) {
    return
  }
  const currentGame = workspaceStore.currentGame
  if (!currentGame) {
    return
  }
  if (!ok) {
    modalStore.open('RecoverGameModal', { game: currentGame }, gameId, true)
    return
  }

  try {
    await gameManager.ensureEditorRuntimeCompatible(currentGame)
  } catch (error) {
    if (workspaceStore.currentGame?.id !== gameId) {
      return
    }
    if (isRuntimeRebindRequired(error)) {
      let rebound = false
      try {
        rebound = await requestGameRuntimeRebind(currentGame, {
          ...resolveRuntimeRebindIssue(error.details?.issue),
          resolveDependencies: context => requestImportDependencyResolution(context, {
            onCancel: () => {
              void exitEditMode()
            },
          }),
        })
      } catch (rebindError) {
        void logger.warn(`[编辑器入口] 运行时重绑失败，已离开编辑页: ${String(rebindError)}`)
      }

      if (workspaceStore.currentGame?.id !== gameId) {
        return
      }

      if (!rebound) {
        await exitEditMode()
        return
      }

      if (workspaceStore.currentGame?.id === gameId) {
        try {
          await workspaceStore.refreshCurrentGameSnapshot()
        } catch (refreshError) {
          void logger.warn(`[编辑器入口] 运行时重绑后刷新游戏快照失败: ${String(refreshError)}`)
        }
        // 重绑前文档加载失败只会留下标签页错误态，不会自动重试，这里把它补上
        await editorStore.retryActiveDocument()
      }
      return
    }

    // 其余错误不能吞掉：编辑页会停在空文件树上，用户无从判断发生了什么
    handleError(error)
  }
}, { immediate: true })

const currentEditorMode = computed(() => {
  const currentState = editorStore.currentState
  return currentState && isEditableEditor(currentState)
    ? currentState.projection
    : 'none'
})

const currentVisualType = computed(() => editorStore.currentVisualProjection?.kind ?? 'none')
const hasSelection = computed(() =>
  currentVisualType.value === 'scene'
  && editorStore.currentSelectedSceneStatement !== undefined,
)
const isDirty = computed(() => {
  const currentState = editorStore.currentState
  return Boolean(currentState && isEditableEditor(currentState) && currentState.isDirty)
})
const isModalOpen = computed(() => modalStore.hasOpenModal)

async function saveCurrentFile() {
  const currentState = editorStore.currentState
  if (!currentState || !isEditableEditor(currentState)) {
    return
  }

  await editorStore.saveFile(currentState.path)
}

function toggleCommandPanel() {
  editorPanelRef.value?.toggleCommandPanel?.()
}

function toggleSidebar() {
  if (viewMode !== 'scene' || !editorStore.isCurrentSceneFile) {
    return
  }

  preferenceStore.showSidebar = !preferenceStore.showSidebar
}

// 场景编辑的布局偏好只属于场景视图，流程页快捷键不得改动它
function togglePreviewPanel() {
  if (viewMode !== 'scene') {
    return
  }

  preferenceStore.showPreviewPanel = !preferenceStore.showPreviewPanel
}

function setLeftPanelView(view: 'resource' | 'scene') {
  if (viewMode !== 'scene') {
    return
  }

  preferenceStore.leftPanelView = view
}

useShortcutDispatcher({
  bindings: createEditorShortcutDefinitions(),
  executeContext: {
    saveCurrentFile,
    setLeftPanelView,
    toggleCommandPanel,
    togglePreviewPanel,
    toggleSidebar,
  },
})

useShortcutContext({
  commandPanelOpen: false,
  editorMode: currentEditorMode,
  hasSelection,
  isDirty,
  isModalOpen,
  panelFocus: 'none',
  visualType: currentVisualType,
})
</script>

<template>
  <div class="bg-background flex flex-col overflow-hidden">
    <EditHeader ::view-mode="viewMode" />
    <FlowchartEditor
      v-if="viewMode === 'flowchart'"
      :workspace="flowchartWorkspace"
    />
    <!--
      场景视图只隐藏、不卸载：流程页只是临时配置，切回来时不能重建 Monaco，也不能丢掉预览会话。
      不能用 KeepAlive——它把子树移进脱离文档的缓存容器，iframe 的浏览上下文会被销毁，预览照样重新加载。
      流程画布仍按需挂载：它依赖尺寸测量与全局撤销/删除监听，隐藏存活的实例会算错坐标。
    -->
    <ResizablePanelGroup
      v-show="viewMode === 'scene'"
      auto-save-id="editor-main"
      class="flex-1 min-h-0"
      direction="horizontal"
    >
      <!-- 左栏（预览 + 场景/资源） -->
      <ResizablePanel
        size-unit="px"
        :default-size="380"
        :min-size="280"
      >
        <LeftPanel />
      </ResizablePanel>
      <ResizableHandle />
      <!-- 编辑器区域（标签页+编辑器+命令面板+辅助面板） -->
      <ResizablePanel size-unit="px" :min-size="600">
        <EditorPanel ref="editorPanel" />
      </ResizablePanel>
    </ResizablePanelGroup>
    <EditorStatusBar />
  </div>
</template>
