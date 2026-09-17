<script setup lang="ts">
import { useStatementAnimationEditorPanel } from '~/features/editor/animation/useStatementAnimationEditorPanel'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'

import type { AnimationFrame } from '~/domain/stage/types'

interface Props {
  frames: readonly AnimationFrame[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:frames': [frames: AnimationFrame[]]
}>()

const panelRef = useTemplateRef<HTMLElement>('panelRef')

// 面板挂载即接管焦点，卸载时必须把焦点还给打开它的元素：容器不会替我们记住，
// 焦点若随着面板被移除而落到 body，语句编辑器与可视化编辑器的快捷键上下文会整片失效
const focusOrigin = document.activeElement instanceof HTMLElement ? document.activeElement : undefined

const controller = useStatementAnimationEditorPanel({
  emitFrames: frames => emit('update:frames', frames),
  frames: () => props.frames,
})

useShortcutContext({
  panelFocus: 'animationEditor',
}, {
  target: panelRef,
  trackFocus: true,
})

onMounted(() => {
  panelRef.value?.focus({ preventScroll: true })
})

onBeforeUnmount(() => {
  focusOrigin?.focus({ preventScroll: true })
})
</script>

<template>
  <div
    ref="panelRef"
    data-testid="statement-animation-editor-panel"
    tabindex="-1"
    class="outline-none flex flex-col h-full min-h-0"
  >
    <AnimationEditorPane
      class="flex-1 min-h-0"
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
  </div>
</template>
