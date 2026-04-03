<script setup lang="ts">
import { ResizablePanel } from '~/components/ui/resizable'
import { useAnimationTableSyncBootstrap } from '~/features/editor/animation/useAnimationTableSyncBootstrap'
import { createEditorShortcutDefinitions } from '~/features/editor/shortcut/definitions'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useShortcutDispatcher } from '~/features/editor/shortcut/useShortcutDispatcher'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { useFileStore } from '~/stores/file'
import { useModalStore } from '~/stores/modal'
import { usePreferenceStore } from '~/stores/preference'

interface EditorPanelHandle {
  toggleCommandPanel?: () => void
}

const editorStore = useEditorStore()
useFileStore()
const modalStore = useModalStore()
const preferenceStore = usePreferenceStore()
const editorPanelRef = useTemplateRef<EditorPanelHandle>('editorPanel')

useAnimationTableSyncBootstrap()

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
        collapsible
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
