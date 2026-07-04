<script setup lang="ts">
import { ResizablePanel } from '~/components/ui/resizable'
import { useAnimationTableSyncBootstrap } from '~/features/editor/animation/useAnimationTableSyncBootstrap'
import { useEffectEditorProvider } from '~/features/editor/effect-editor/useEffectEditorProvider'
import { createEditorShortcutDefinitions } from '~/features/editor/shortcut/definitions'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useShortcutDispatcher } from '~/features/editor/shortcut/useShortcutDispatcher'
import { TRANSFORM_OVERLAY_BRIDGE_KEY } from '~/features/editor/transform-overlay/context'
import { useTransformOverlayBridge } from '~/features/editor/transform-overlay/useTransformOverlayBridge'
import { requestGameRuntimeRebind, resolveRuntimeRebindIssue } from '~/features/modals/import-dependency-resolution/request-game-runtime-rebind'
import { requestImportDependencyResolution } from '~/features/modals/import-dependency-resolution/request-import-dependency-resolution'
import { gameManager } from '~/services/game-manager'
import { useResourceIndexBootstrap } from '~/services/resource-index/service'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { useFileStore } from '~/stores/file'
import { useModalStore } from '~/stores/modal'
import { usePreferenceStore } from '~/stores/preference'
import { useWorkspaceStore } from '~/stores/workspace'
import { AppError } from '~/types/errors'

interface EditorPanelHandle {
  toggleCommandPanel?: () => void
}

const editorStore = useEditorStore()
useFileStore()
const modalStore = useModalStore()
const preferenceStore = usePreferenceStore()
const workspaceStore = useWorkspaceStore()
const router = useRouter()
const editorPanelRef = useTemplateRef<EditorPanelHandle>('editorPanel')
const effectEditorProvider = useEffectEditorProvider()
const transformOverlayBridge = useTransformOverlayBridge({
  provider: effectEditorProvider,
})

provide(TRANSFORM_OVERLAY_BRIDGE_KEY, transformOverlayBridge)

let pendingEditExit: Promise<void> | undefined

function exitEditMode(): Promise<void> {
  pendingEditExit ??= router.replace('/').then(() => undefined)
  return pendingEditExit
}

useAnimationTableSyncBootstrap()
useResourceIndexBootstrap()

// 进入工作区时即时校验：失效则进入阻断式恢复弹窗，由用户决定重试 / 重链接 / 返回主页
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
    if (error instanceof AppError && error.code === 'ENGINE_EDITOR_INCOMPATIBLE') {
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
      }
      return
    }
    throw error
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
const isModalOpen = computed(() => [...modalStore.modalStack.values()].some(modal => modal.isOpen))

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
  if (!editorStore.isCurrentSceneFile) {
    return
  }

  preferenceStore.showSidebar = !preferenceStore.showSidebar
}

function togglePreviewPanel() {
  preferenceStore.showPreviewPanel = !preferenceStore.showPreviewPanel
}

function setLeftPanelView(view: 'resource' | 'scene') {
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
  <div class="flex flex-col overflow-hidden">
    <EditHeader />
    <ResizablePanelGroup
      auto-save-id="editor-main"
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
