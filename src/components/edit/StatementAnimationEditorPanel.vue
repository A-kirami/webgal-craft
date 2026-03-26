<script setup lang="ts">
import {
  deleteAnimationFrameAtSelection,
  insertAnimationFrameAfterSelection,
  normalizeAnimationFrameDurationInput,
  normalizeAnimationFrameEaseInput,
  resolveAnimationTimelineDurationChange,
  updateAnimationFrameAt,
} from '~/helper/animation-frame-editor'

import { createAnimationTransformPatch } from './animation/animation-inspector'
import AnimationEditorPane from './animation/AnimationEditorPane.vue'
import { createDefaultAnimationFrame, useAnimationEditorSession } from './animation/useAnimationEditorSession'

import type { AnimationTimelineResizeDurationPayload } from './animation/animation-editor-contract'
import type { EffectEditorTransformUpdatePayload } from '~/composables/useEffectEditorProvider'
import type { AnimationFrame } from '~/types/stage'

interface Props {
  frames: readonly AnimationFrame[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:frames': [frames: AnimationFrame[]]
}>()

const session = useAnimationEditorSession(() => props.frames)

watch(
  () => session.selectedFrameId,
  session.resetSelectedFrameDrafts,
)

function emitFrames(nextFrames: AnimationFrame[]): void {
  emit('update:frames', nextFrames)
}

function updateFrame(frameIndex: number, patch: Partial<AnimationFrame>): void {
  const nextFrames = updateAnimationFrameAt(props.frames, frameIndex, patch)
  if (!nextFrames) {
    return
  }

  emitFrames(nextFrames)
}

function handleAddFrame(): void {
  const result = insertAnimationFrameAfterSelection(
    props.frames,
    session.selectedFrameIndex,
    createDefaultAnimationFrame(),
  )

  emitFrames(result.nextFrames)
  session.selectedFrameId = result.selectedFrameId
}

function handleDeleteFrame(): void {
  const result = deleteAnimationFrameAtSelection(props.frames, session.selectedFrameIndex)
  if (!result) {
    return
  }

  session.resetSelectedFrameDrafts()
  emitFrames(result.nextFrames)
  session.selectedFrameId = result.selectedFrameId
}

function handleTransformUpdate(payload: EffectEditorTransformUpdatePayload): void {
  if (!payload.flush) {
    session.setSelectedFrameTransformDraft(payload.value)
    return
  }

  const currentFrame = session.selectedFrame
  if (!currentFrame) {
    return
  }

  updateFrame(session.selectedFrameIndex, createAnimationTransformPatch(currentFrame, payload.value))
  session.resetSelectedFrameTransformDraft()
}

function handleDurationUpdate(value: string): void {
  const nextDuration = normalizeAnimationFrameDurationInput(value)
  if (nextDuration === undefined || session.selectedFrameIndex < 0) {
    return
  }

  session.resetSelectedFrameDurationDraft()
  updateFrame(session.selectedFrameIndex, { duration: nextDuration })
}

function handleTimelineResizeDuration(payload: AnimationTimelineResizeDurationPayload): void {
  const change = resolveAnimationTimelineDurationChange(props.frames, payload)
  if (!change) {
    return
  }

  session.selectedFrameId = change.frameId

  if (!payload.flush) {
    session.setSelectedFrameDurationDraft(change.frameId, change.duration)
    return
  }

  session.resetSelectedFrameDurationDraft()
  updateFrame(change.frameIndex, { duration: change.duration })
}

function handleEaseUpdate(value: string): void {
  if (session.isSelectedFrameEaseDisabled || session.selectedFrameIndex < 0) {
    return
  }

  updateFrame(session.selectedFrameIndex, { ease: normalizeAnimationFrameEaseInput(value) })
}
</script>

<template>
  <AnimationEditorPane
    :keyframes="session.keyframes"
    :selected-frame-id="session.selectedFrameId"
    :timeline-zoom-percent="session.timelineZoomPercent"
    :total-duration="session.totalDuration"
    :can-delete-frame="session.canDeleteFrame"
    :selected-frame="session.selectedFrameState"
    @add-frame="handleAddFrame"
    @delete-frame="handleDeleteFrame"
    @select-frame="session.selectedFrameId = $event"
    @zoom-change="session.timelineZoomPercent = $event"
    @resize-duration="handleTimelineResizeDuration"
    @update:selected-frame-transform="handleTransformUpdate"
    @update:selected-frame-duration="handleDurationUpdate"
    @update:selected-frame-ease="handleEaseUpdate"
  />
</template>
