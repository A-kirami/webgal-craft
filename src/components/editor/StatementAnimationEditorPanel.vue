<script setup lang="ts">
import { useStatementAnimationEditorPanel } from '~/features/editor/animation/useStatementAnimationEditorPanel'

import type { AnimationFrame } from '~/domain/stage/types'

interface Props {
  frames: readonly AnimationFrame[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:frames': [frames: AnimationFrame[]]
}>()

const controller = useStatementAnimationEditorPanel({
  emitFrames: frames => emit('update:frames', frames),
  frames: () => props.frames,
})
</script>

<template>
  <AnimationEditorPane
    :keyframes="controller.session.keyframes"
    :selected-frame-id="controller.session.selectedFrameId"
    :timeline-zoom-percent="controller.session.timelineZoomPercent"
    :total-duration="controller.session.totalDuration"
    :can-delete-frame="controller.session.canDeleteFrame"
    :selected-frame="controller.session.selectedFrameState"
    @add-frame="controller.handleAddFrame"
    @delete-frame="controller.handleDeleteFrame"
    @select-frame="controller.session.selectedFrameId = $event"
    @zoom-change="controller.session.timelineZoomPercent = $event"
    @resize-duration="controller.handleTimelineResizeDuration"
    @update:selected-frame-transform="controller.handleTransformUpdate"
    @update:selected-frame-duration="controller.handleDurationUpdate"
    @update:selected-frame-ease="controller.handleEaseUpdate"
  />
</template>
