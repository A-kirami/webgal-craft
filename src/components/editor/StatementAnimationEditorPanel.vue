<script setup lang="ts">
import { useStatementAnimationEditorPanel } from '~/features/editor/animation/useStatementAnimationEditorPanel'

import type { AnimationFrame } from '~/domain/stage/types'

interface Props {
  frames: readonly AnimationFrame[]
  showFooter?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showFooter: true,
})

const emit = defineEmits<{
  'update:frames': [frames: AnimationFrame[]]
  'apply': []
  'cancel': []
}>()

const panelRef = useTemplateRef<HTMLElement>('panelRef')

// 面板挂载即接管焦点，卸载时把焦点还给打开它的元素：抽屉宿主会请求编辑器表面回焦，
// 但模态宿主、以及当前没有可回焦表面的场景仍要靠这一步兜底
const focusOrigin = document.activeElement instanceof HTMLElement ? document.activeElement : undefined

const controller = useStatementAnimationEditorPanel({
  emitFrames: frames => emit('update:frames', frames),
  frames: () => props.frames,
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

    <div v-if="props.showFooter" class="mt-4 flex gap-2 justify-end">
      <Button size="sm" variant="outline" @click="emit('cancel')">
        {{ $t('common.cancel') }}
      </Button>
      <Button size="sm" @click="emit('apply')">
        {{ $t('common.confirm') }}
      </Button>
    </div>
  </div>
</template>
