<script setup lang="ts">
import { useAnimationFrameShortcuts } from '~/features/editor/animation/useAnimationFrameShortcuts'
import { useShortcut } from '~/features/editor/shortcut/useShortcut'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'

import type { Transform } from '~/domain/stage/types'
import type { AnimationEditorPanelController } from '~/features/editor/animation/useStatementAnimationEditorPanel'
import type { TransformBaselineSource } from '~/features/editor/transform-resolution/model'

interface Props {
  controller: AnimationEditorPanelController
  baselineSource?: TransformBaselineSource
  baselineTransform?: Transform
  previewFieldValue?: (path: string) => string | undefined
  /**
   * 是否提供撤销/重做快捷键。宿主没有撤销体系时（模态框宿主）应当关掉：
   * 子面板单独支持撤销会让用户以为模态里的改动都能撤销。
   */
  enableHistoryShortcuts?: boolean
  showFooter?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  enableHistoryShortcuts: true,
  showFooter: true,
})

const emit = defineEmits<{
  apply: []
  cancel: []
}>()

const panelRef = useTemplateRef<HTMLElement>('panelRef')

// 面板挂载即接管焦点，卸载时把焦点还给打开它的元素：抽屉宿主会请求编辑器表面回焦，
// 但模态宿主、以及当前没有可回焦表面的场景仍要靠这一步兜底
const focusOrigin = document.activeElement instanceof HTMLElement ? document.activeElement : undefined

// 帧级快捷键跟着面板走，而不是跟着宿主：抽屉与模态框共用这个面板，各自只操作自己那份草稿。
// 两类宿主都会独占键盘（模态 isModalOpen、抽屉 editorDrawerOpen），这些绑定必须两边都显式放行。
useShortcutContext({
  animationHistoryShortcuts: () => props.enableHistoryShortcuts,
  panelFocus: 'animationEditor',
}, {
  target: panelRef,
  trackFocus: true,
})

useShortcut({
  allowInEditorDrawer: true,
  allowInModal: true,
  execute: () => {
    props.controller.handleUndo()
  },
  i18nKey: 'shortcut.visual.undo',
  id: 'animation.undo',
  keys: 'Mod+Z',
  when: { animationHistoryShortcuts: true, panelFocus: 'animationEditor' },
})

useShortcut({
  allowInEditorDrawer: true,
  allowInModal: true,
  execute: () => {
    props.controller.handleRedo()
  },
  i18nKey: 'shortcut.visual.redo',
  id: 'animation.redo',
  keys: ['Mod+Shift+Z', 'Mod+Y'],
  when: { animationHistoryShortcuts: true, panelFocus: 'animationEditor' },
})

useAnimationFrameShortcuts({
  actions: props.controller,
  allowInEditorDrawer: true,
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
      :keyframes="props.controller.session.keyframes"
      :selected-frame-id="props.controller.session.selectedFrameId"
      :timeline-zoom-percent="props.controller.session.timelineZoomPercent"
      :total-duration="props.controller.session.totalDuration"
      :can-delete-frame="props.controller.session.canDeleteFrame"
      :selected-frame="props.controller.session.selectedFrameState"
      :baseline-source="props.baselineSource"
      :baseline-transform="props.baselineTransform"
      :preview-field-value="props.previewFieldValue"
      @add-frame="props.controller.handleAddFrame"
      @delete-frame="props.controller.handleDeleteFrame"
      @select-frame="props.controller.selectFrame"
      @zoom-change="props.controller.setTimelineZoomPercent"
      @resize-duration="props.controller.handleTimelineResizeDuration"
      @update:selected-frame-transform="props.controller.handleTransformUpdate"
      @update:selected-frame-duration="props.controller.handleDurationUpdate"
      @update:selected-frame-ease="props.controller.handleEaseUpdate"
      @cancel-preview="props.controller.handleTransformCancelPreview"
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
