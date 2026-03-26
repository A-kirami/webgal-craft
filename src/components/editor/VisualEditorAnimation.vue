<script setup lang="ts">
import { useVisualEditorAnimation } from '~/features/editor/animation/useVisualEditorAnimation'
import { isAnimationVisualProjection, useEditorStore } from '~/stores/editor'

import AnimationEditorPane from './animation/AnimationEditorPane.vue'

import type { AnimationVisualProjectionState } from '~/stores/editor'

interface Props {
  state: AnimationVisualProjectionState
}

const props = defineProps<Props>()

const editorStore = useEditorStore()
const controller = useVisualEditorAnimation({
  activeElement: () => document.activeElement,
  applyAnimationFrameDelete: (path, frameIndex) => editorStore.applyAnimationFrameDelete(path, frameIndex),
  applyAnimationFrameInsert: (path, insertAfterIndex, frame) =>
    editorStore.applyAnimationFrameInsert(path, insertAfterIndex, frame),
  applyAnimationFrameUpdate: (path, frameIndex, patch) =>
    editorStore.applyAnimationFrameUpdate(path, frameIndex, patch),
  canRedo: path => editorStore.canRedoDocument(path),
  canUndo: path => editorStore.canUndoDocument(path),
  isCurrentProjectionActive: () => {
    const currentState = editorStore.currentState
    return currentState !== undefined
      && isAnimationVisualProjection(currentState)
      && currentState.path === props.state.path
  },
  redoDocument: path => editorStore.redoDocument(path),
  scheduleAutoSaveIfEnabled: path => editorStore.scheduleAutoSaveIfEnabled(path),
  state: () => props.state,
  undoDocument: path => editorStore.undoDocument(path),
})

useEventListener('keydown', controller.handleHistoryShortcutKeydown)

onUnmounted(controller.dispose)
</script>

<template>
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
</template>
