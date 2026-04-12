<script setup lang="ts">
import { useVisualEditorAnimation } from '~/features/editor/animation/useVisualEditorAnimation'
import { useShortcut } from '~/features/editor/shortcut/useShortcut'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useVisualEditorFocusRequest } from '~/features/editor/visual-editor/useVisualEditorFocusRequest'
import { findSelectedVisualEditorAnimationFrame } from '~/features/editor/visual-editor/visual-editor-focus'
import { useEditorStore } from '~/stores/editor'

import type { AnimationVisualProjectionState } from '~/stores/editor'

interface Props {
  state: AnimationVisualProjectionState
}

const props = defineProps<Props>()

const editorStore = useEditorStore()
const editorSurfaceRef = useTemplateRef<HTMLDivElement>('editorSurfaceRef')
const controller = useVisualEditorAnimation({
  applyAnimationFrameDelete: (path, frameIndex) => editorStore.applyAnimationFrameDelete(path, frameIndex),
  applyAnimationFrameInsert: (path, insertAfterIndex, frame) =>
    editorStore.applyAnimationFrameInsert(path, insertAfterIndex, frame),
  applyAnimationFrameUpdate: (path, frameIndex, patch) =>
    editorStore.applyAnimationFrameUpdate(path, frameIndex, patch),
  canRedo: path => editorStore.canRedoDocument(path),
  canUndo: path => editorStore.canUndoDocument(path),
  redoDocument: path => editorStore.redoDocument(path),
  scheduleAutoSaveIfEnabled: path => editorStore.scheduleAutoSaveIfEnabled(path),
  state: () => props.state,
  undoDocument: path => editorStore.undoDocument(path),
})

useShortcutContext({
  panelFocus: 'editor',
}, {
  target: editorSurfaceRef,
  trackFocus: true,
})

useVisualEditorFocusRequest({
  path: computed(() => props.state.path),
  resolveFocusTarget(root) {
    const selectedFrame = findSelectedVisualEditorAnimationFrame(root)
    return selectedFrame instanceof HTMLElement ? selectedFrame : undefined
  },
  rootElement: editorSurfaceRef,
})

useShortcut({
  execute: () => {
    controller.handleUndo()
  },
  i18nKey: 'shortcut.visual.undo',
  id: 'visual.undo',
  keys: 'Mod+Z',
  when: {
    panelFocus: 'editor',
    visualType: 'animation',
  },
})

useShortcut({
  execute: () => {
    controller.handleRedo()
  },
  i18nKey: 'shortcut.visual.redo',
  id: 'visual.redo',
  keys: ['Mod+Shift+Z', 'Mod+Y'],
  when: {
    panelFocus: 'editor',
    visualType: 'animation',
  },
})

useShortcut({
  execute: () => {
    controller.handleDeleteFrame()
  },
  i18nKey: 'shortcut.visual.delete',
  id: 'visual.delete',
  keys: 'Delete',
  when: {
    panelFocus: 'editor',
    visualType: 'animation',
  },
})

onUnmounted(controller.dispose)
</script>

<template>
  <div ref="editorSurfaceRef" tabindex="-1" class="outline-none h-full min-h-0">
    <AnimationEditorPane
      :keyframes="controller.session.keyframes"
      :selected-frame-id="controller.session.selectedFrameId"
      :timeline-zoom-percent="controller.session.timelineZoomPercent"
      :total-duration="controller.session.totalDuration"
      :can-delete-frame="controller.session.canDeleteFrame"
      :selected-frame="controller.session.selectedFrameState"
      :show-history-actions="true"
      :can-undo="controller.canUndo"
      :can-redo="controller.canRedo"
      @add-frame="controller.handleAddFrame"
      @delete-frame="controller.handleDeleteFrame"
      @undo="controller.handleUndo"
      @redo="controller.handleRedo"
      @select-frame="controller.session.selectedFrameId = $event"
      @zoom-change="controller.session.timelineZoomPercent = $event"
      @resize-duration="controller.handleTimelineResizeDuration"
      @update:selected-frame-transform="controller.handleTransformUpdate"
      @update:selected-frame-duration="controller.handleDurationUpdate"
      @update:selected-frame-ease="controller.handleEaseUpdate"
    />
  </div>
</template>
