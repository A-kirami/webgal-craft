<script setup lang="ts">
import { cloneAnimationFrame, cloneAnimationFrames } from '~/helper/animation-frame'

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
  const currentFrame = props.frames[frameIndex]
  if (!currentFrame || Object.keys(patch).length === 0) {
    return
  }

  const nextFrames = props.frames.map((frame, index) => {
    if (index !== frameIndex) {
      return cloneAnimationFrame(frame)
    }
    return {
      ...cloneAnimationFrame(frame),
      ...patch,
    }
  })

  emitFrames(nextFrames)
}

function handleAddFrame(): void {
  const insertAfterIndex = session.selectedFrameIndex >= 0 ? session.selectedFrameIndex : undefined
  const nextFrames = cloneAnimationFrames(props.frames)
  const insertIndex = insertAfterIndex === undefined ? nextFrames.length : insertAfterIndex + 1
  nextFrames.splice(insertIndex, 0, createDefaultAnimationFrame())
  emitFrames(nextFrames)
  session.selectedFrameId = insertIndex + 1
}

function handleDeleteFrame(): void {
  const frameIndex = session.selectedFrameIndex
  if (frameIndex < 0) {
    return
  }

  session.resetSelectedFrameDrafts()
  const nextFrames = props.frames
    .filter((_, index) => index !== frameIndex)
    .map(frame => cloneAnimationFrame(frame))
  emitFrames(nextFrames)

  const nextSelectedIndex = Math.min(frameIndex, nextFrames.length - 1)
  session.selectedFrameId = nextSelectedIndex >= 0 ? nextSelectedIndex + 1 : 1
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
  const normalizedValue = value.trim()
  const nextDuration = normalizedValue === '' ? 0 : Number(normalizedValue)
  if (!Number.isFinite(nextDuration) || nextDuration < 0 || session.selectedFrameIndex < 0) {
    return
  }

  session.resetSelectedFrameDurationDraft()
  updateFrame(session.selectedFrameIndex, { duration: nextDuration })
}

function handleTimelineResizeDuration(payload: AnimationTimelineResizeDurationPayload): void {
  const frameIndex = payload.id - 1
  const currentFrame = props.frames[frameIndex]
  if (!currentFrame) {
    return
  }

  const nextDuration = Math.max(0, Math.round(payload.duration))
  session.selectedFrameId = payload.id

  if (!payload.flush) {
    session.setSelectedFrameDurationDraft(payload.id, nextDuration)
    return
  }

  session.resetSelectedFrameDurationDraft()
  updateFrame(frameIndex, { duration: nextDuration })
}

function handleEaseUpdate(value: string): void {
  if (session.isSelectedFrameEaseDisabled || session.selectedFrameIndex < 0) {
    return
  }

  updateFrame(session.selectedFrameIndex, { ease: value.trim() || undefined })
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
