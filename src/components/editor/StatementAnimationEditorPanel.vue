<script setup lang="ts">
import { useAnimationFrameShortcuts } from '~/features/editor/animation/useAnimationFrameShortcuts'
import { useStatementAnimationEditorPanel } from '~/features/editor/animation/useStatementAnimationEditorPanel'
import { useShortcut } from '~/features/editor/shortcut/useShortcut'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'

import type { AnimationFrame } from '~/domain/stage/types'

interface Props {
  /**
   * 是否提供撤销/重做快捷键。宿主没有撤销体系时（模态框宿主）应当关掉：
   * 子面板单独支持撤销会让用户以为模态里的改动都能撤销。
   */
  enableHistoryShortcuts?: boolean
  frames: readonly AnimationFrame[]
  showFooter?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  enableHistoryShortcuts: true,
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

// 帧级快捷键跟着面板走，而不是跟着宿主：抽屉与模态框共用这个面板，各自只操作自己那份草稿。
// 宿主（如模态框）打开期间窗口级 isModalOpen 为 true，因此这些绑定必须显式放行模态场景。
useShortcutContext({
  animationHistoryShortcuts: () => props.enableHistoryShortcuts,
  panelFocus: 'animationEditor',
}, {
  target: panelRef,
  trackFocus: true,
})

useShortcut({
  allowInModal: true,
  execute: () => {
    controller.handleUndo()
  },
  i18nKey: 'shortcut.visual.undo',
  id: 'animation.undo',
  keys: 'Mod+Z',
  when: { animationHistoryShortcuts: true, panelFocus: 'animationEditor' },
})

useShortcut({
  allowInModal: true,
  execute: () => {
    controller.handleRedo()
  },
  i18nKey: 'shortcut.visual.redo',
  id: 'animation.redo',
  keys: ['Mod+Shift+Z', 'Mod+Y'],
  when: { animationHistoryShortcuts: true, panelFocus: 'animationEditor' },
})

useAnimationFrameShortcuts({
  actions: controller,
  allowInModal: true,
  when: { panelFocus: 'animationEditor' },
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
