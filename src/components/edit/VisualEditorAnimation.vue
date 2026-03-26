<script setup lang="ts">
import {
  normalizeAnimationFrameDurationInput,
  normalizeAnimationFrameEaseInput,
  resolveAnimationTimelineDurationChange,
} from '~/helper/animation-frame-editor'
import { resolveHistoryShortcutAction } from '~/helper/history-shortcut'
import { isAnimationVisualProjection, useEditorStore } from '~/stores/editor'

import { createAnimationTransformPatch } from './animation/animation-inspector'
import AnimationEditorPane from './animation/AnimationEditorPane.vue'
import { createDefaultAnimationFrame, useAnimationEditorSession } from './animation/useAnimationEditorSession'

import type { AnimationTimelineResizeDurationPayload } from './animation/animation-editor-contract'
import type { EffectEditorTransformUpdatePayload } from '~/composables/useEffectEditorProvider'
import type { AnimationVisualProjectionState } from '~/stores/editor'
import type { AnimationFrame, Transform } from '~/types/stage'

interface Props {
  state: AnimationVisualProjectionState
}

const props = defineProps<Props>()

const editorStore = useEditorStore()

const session = useAnimationEditorSession(() => props.state.frames)
let pendingTransformDraft = $ref<Transform>()
let pendingTransformDraftFrameId = $ref<number>()

const canUndo = $computed(() => editorStore.canUndoDocument(props.state.path))
const canRedo = $computed(() => editorStore.canRedoDocument(props.state.path))

watch(
  () => props.state.path,
  session.resetSelectedFrameDrafts,
)

watch(
  () => session.selectedFrameId,
  resetSelectedFrameTransformDraft,
)

function flushPendingTransformDraft(): void {
  if (pendingTransformDraftFrameId === undefined) {
    return
  }

  cancelAnimationFrame(pendingTransformDraftFrameId)
  pendingTransformDraftFrameId = undefined
  session.setSelectedFrameTransformDraft(pendingTransformDraft)
  pendingTransformDraft = undefined
}

function scheduleSelectedFrameTransformDraft(nextTransform: Transform): void {
  pendingTransformDraft = nextTransform
  if (pendingTransformDraftFrameId !== undefined) {
    return
  }

  pendingTransformDraftFrameId = requestAnimationFrame(() => {
    pendingTransformDraftFrameId = undefined
    session.setSelectedFrameTransformDraft(pendingTransformDraft)
    pendingTransformDraft = undefined
  })
}

function scheduleSelectedFrameDurationDraft(frameId: number, nextDuration: number): void {
  session.setSelectedFrameDurationDraft(frameId, nextDuration)
}

function resetSelectedFrameTransformDraft(): void {
  if (pendingTransformDraftFrameId !== undefined) {
    cancelAnimationFrame(pendingTransformDraftFrameId)
    pendingTransformDraftFrameId = undefined
  }

  pendingTransformDraft = undefined
  session.resetSelectedFrameTransformDraft()
}

function resetSelectedFrameDurationDraft(): void {
  session.resetSelectedFrameDurationDraft()
}

function applySelectedFramePatch(patch: Partial<AnimationFrame>) {
  const frameIndex = session.selectedFrameIndex
  if (frameIndex < 0) {
    return
  }

  if (Object.keys(patch).length === 0) {
    return
  }

  editorStore.applyAnimationFrameUpdate(props.state.path, frameIndex, patch)
  editorStore.scheduleAutoSaveIfEnabled(props.state.path)
}

function handleAddFrame(): void {
  resetSelectedFrameTransformDraft()
  resetSelectedFrameDurationDraft()

  const insertAfterIndex = session.selectedFrameIndex >= 0 ? session.selectedFrameIndex : undefined
  editorStore.applyAnimationFrameInsert(props.state.path, insertAfterIndex, createDefaultAnimationFrame())
  session.selectedFrameId = insertAfterIndex === undefined ? 1 : insertAfterIndex + 2
  editorStore.scheduleAutoSaveIfEnabled(props.state.path)
}

function handleDeleteFrame(): void {
  const frameIndex = session.selectedFrameIndex
  if (frameIndex < 0) {
    return
  }

  resetSelectedFrameTransformDraft()
  resetSelectedFrameDurationDraft()

  const nextSelectedIndex = Math.min(frameIndex, props.state.frames.length - 2)
  editorStore.applyAnimationFrameDelete(props.state.path, frameIndex)
  session.selectedFrameId = nextSelectedIndex >= 0 ? nextSelectedIndex + 1 : 1
  editorStore.scheduleAutoSaveIfEnabled(props.state.path)
}

function handleTransformUpdate(payload: EffectEditorTransformUpdatePayload) {
  if (!payload.flush) {
    scheduleSelectedFrameTransformDraft(payload.value)
    return
  }

  flushPendingTransformDraft()

  const currentFrame = session.selectedFrame
  if (!currentFrame) {
    return
  }

  applySelectedFramePatch(createAnimationTransformPatch(currentFrame, payload.value))
  resetSelectedFrameTransformDraft()
}

function handleDurationUpdate(value: string) {
  const nextDuration = normalizeAnimationFrameDurationInput(value)
  if (nextDuration === undefined) {
    return
  }

  if (session.selectedFrameResolvedDuration === nextDuration) {
    return
  }

  resetSelectedFrameDurationDraft()
  applySelectedFramePatch({ duration: nextDuration })
}

function handleTimelineResizeDuration(payload: AnimationTimelineResizeDurationPayload): void {
  const change = resolveAnimationTimelineDurationChange(props.state.frames, payload)
  if (!change) {
    return
  }

  const currentFrame = props.state.frames[change.frameIndex]
  if (currentFrame?.duration === change.duration) {
    return
  }

  session.selectedFrameId = change.frameId

  if (!payload.flush) {
    scheduleSelectedFrameDurationDraft(change.frameId, change.duration)
    return
  }

  resetSelectedFrameDurationDraft()
  editorStore.applyAnimationFrameUpdate(props.state.path, change.frameIndex, { duration: change.duration })
  editorStore.scheduleAutoSaveIfEnabled(props.state.path)
}

function handleEaseUpdate(value: string) {
  if (session.isSelectedFrameEaseDisabled) {
    return
  }

  const nextEase = normalizeAnimationFrameEaseInput(value)
  const currentEase = session.selectedFrame?.ease?.trim() || undefined
  if (currentEase === nextEase) {
    return
  }

  applySelectedFramePatch({ ease: nextEase })
}

function isEditingText(): boolean {
  const element = document.activeElement
  if (!element) {
    return false
  }

  const tagName = element.tagName
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || (element as HTMLElement).isContentEditable
}

function isCurrentVisualProjectionActive(): boolean {
  const currentState = editorStore.currentState
  return currentState !== undefined
    && isAnimationVisualProjection(currentState)
    && currentState.path === props.state.path
}

function isFocusInsideOverlay(): boolean {
  const element = document.activeElement as HTMLElement | null
  if (!element) {
    return false
  }

  return !!element.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-side][data-state="open"]')
}

function handleUndo(): void {
  resetSelectedFrameTransformDraft()
  resetSelectedFrameDurationDraft()
  if (!editorStore.undoDocument(props.state.path).applied) {
    return
  }

  editorStore.scheduleAutoSaveIfEnabled(props.state.path)
}

function handleRedo(): void {
  resetSelectedFrameTransformDraft()
  resetSelectedFrameDurationDraft()
  if (!editorStore.redoDocument(props.state.path).applied) {
    return
  }

  editorStore.scheduleAutoSaveIfEnabled(props.state.path)
}

useEventListener('keydown', (event: KeyboardEvent) => {
  if (
    event.defaultPrevented
    || !isCurrentVisualProjectionActive()
    || isEditingText()
    || isFocusInsideOverlay()
  ) {
    return
  }

  const historyAction = resolveHistoryShortcutAction(event)
  if (!historyAction) {
    return
  }

  event.preventDefault()
  if (historyAction === 'redo') {
    handleRedo()
  } else {
    handleUndo()
  }
})

onUnmounted(() => {
  resetSelectedFrameTransformDraft()
  resetSelectedFrameDurationDraft()
})
</script>

<template>
  <AnimationEditorPane
    :keyframes="session.keyframes"
    :selected-frame-id="session.selectedFrameId"
    :timeline-zoom-percent="session.timelineZoomPercent"
    :total-duration="session.totalDuration"
    :can-delete-frame="session.canDeleteFrame"
    :selected-frame="session.selectedFrameState"
    :show-history-actions="true"
    :can-undo="canUndo"
    :can-redo="canRedo"
    @add-frame="handleAddFrame"
    @delete-frame="handleDeleteFrame"
    @undo="handleUndo"
    @redo="handleRedo"
    @select-frame="session.selectedFrameId = $event"
    @zoom-change="session.timelineZoomPercent = $event"
    @resize-duration="handleTimelineResizeDuration"
    @update:selected-frame-transform="handleTransformUpdate"
    @update:selected-frame-duration="handleDurationUpdate"
    @update:selected-frame-ease="handleEaseUpdate"
  />
</template>
