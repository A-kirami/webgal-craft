<script setup lang="ts">
import { REFERENCED_ANIMATION_PREVIEW_KEY } from '~/features/editor/animation/referenced-animation-editor-context'
import { useAnimationFramePreview } from '~/features/editor/animation/useAnimationFramePreview'
import { useAnimationFramePreviewNotice } from '~/features/editor/animation/useAnimationFramePreviewNotice'
import { useAnimationFrameShortcuts } from '~/features/editor/animation/useAnimationFrameShortcuts'
import { useStatementAnimationEditorPanel } from '~/features/editor/animation/useStatementAnimationEditorPanel'
import { useShortcut } from '~/features/editor/shortcut/useShortcut'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'

import type { AnimationFrame } from '~/domain/stage/types'
import type { AnimationFramePreviewContext } from '~/features/editor/animation/useAnimationFramePreview'

interface Props {
  /** 抽屉持有的动画草稿；帧操作只改这份草稿，保存时才写回文件 */
  frames: AnimationFrame[]
  /** 语句侧帧预览上下文：有目标且预览可用时把浮层拖拽写回当前帧 */
  framePreview?: AnimationFramePreviewContext
  previewFieldValue?: (path: string) => string | undefined
}

const props = withDefaults(defineProps<Props>(), {
  framePreview: undefined,
  previewFieldValue: undefined,
})

const emit = defineEmits<{
  'update:frames': [frames: AnimationFrame[]]
}>()

const PANEL_FOCUS = 'animationFileEditor'

const panelRef = useTemplateRef<HTMLDivElement>('panelRef')
const previewRegistry = inject(REFERENCED_ANIMATION_PREVIEW_KEY, undefined)
const controller = useStatementAnimationEditorPanel({
  emitFrames: next => emit('update:frames', next),
  frames: () => props.frames,
})

// 打开时预览已停在语句执行后的终态（末帧）；默认选末帧，避免抽屉一打开就跳回首帧。
if (props.frames.length > 0) {
  controller.session.selectedFrameId = props.frames.length
}

const selectedFrameTime = computed(() => {
  return controller.session.keyframes
    .find(frame => frame.id === controller.session.selectedFrameId)
    ?.cumulativeTime
})

const preview = useAnimationFramePreview({
  commitSelectedFrameTransform: transform => controller.handleTransformUpdate({
    flush: true,
    value: transform,
  }),
  context: () => props.framePreview,
  deferRestoreToAutoSave: false,
  frames: () => props.frames,
  getRestoreLineCommandString: () => props.framePreview?.lineCommandString ?? '',
  isOpen: () => true,
  selectedFrameDuration: () => controller.session.selectedFrameResolvedDuration,
  selectedFrameIndex: () => controller.session.selectedFrameIndex,
  selectedFrameTime: () => selectedFrameTime.value,
  selectedFrameTransform: () => controller.session.selectedFrameState?.transform,
  // 面板每次打开都会重新挂载，预览会话不需要额外编号
  sessionId: () => 0,
})

const previewNotice = useAnimationFramePreviewNotice(() => preview.notice)

// 降级提示与语句抽屉共用抽屉头部的提示位；面板只负责把原因交出去
const framePreviewNotice = defineModel<string | undefined>('framePreviewNotice', { default: undefined })

watch(previewNotice, (notice) => {
  framePreviewNotice.value = notice
}, { immediate: true })

onMounted(() => {
  previewRegistry?.register(preview)
  panelRef.value?.focus({ preventScroll: true })
})

onBeforeUnmount(() => {
  previewRegistry?.unregister(preview)
  void preview.close()
})

// 抽屉打开期间由这个面板接管动画文件文档的键盘与快捷键上下文
useShortcutContext({
  panelFocus: PANEL_FOCUS,
}, {
  target: panelRef,
  trackFocus: true,
})

useShortcut({
  allowInEditorDrawer: true,
  allowInInput: true,
  execute: () => {
    controller.handleUndo()
  },
  i18nKey: 'shortcut.visual.undo',
  id: 'animationFile.undo',
  keys: 'Mod+Z',
  when: { panelFocus: PANEL_FOCUS },
})

useShortcut({
  allowInEditorDrawer: true,
  allowInInput: true,
  execute: () => {
    controller.handleRedo()
  },
  i18nKey: 'shortcut.visual.redo',
  id: 'animationFile.redo',
  keys: ['Mod+Shift+Z', 'Mod+Y'],
  when: { panelFocus: PANEL_FOCUS },
})

useAnimationFrameShortcuts({
  actions: controller,
  allowInEditorDrawer: true,
  when: { panelFocus: PANEL_FOCUS },
})

// 与高级动画编辑器一致：焦点落在预览浮层时，撤销/重做、复制/粘贴与翻转仍作用于当前草稿。
// 抽屉打开且面板已挂载时，浮层只可能由这份草稿驱动；两个条件的 when 仍比 shell 的绑定更具体
const overlayShortcutWhen = {
  editorDrawerOpen: true,
  panelFocus: 'transformOverlay',
} as const

useShortcut({
  allowInEditorDrawer: true,
  execute: () => controller.handleUndo(),
  i18nKey: 'shortcut.visual.undo',
  id: 'animationFile.overlayUndo',
  keys: 'Mod+Z',
  when: overlayShortcutWhen,
})

useShortcut({
  allowInEditorDrawer: true,
  execute: () => controller.handleRedo(),
  i18nKey: 'shortcut.visual.redo',
  id: 'animationFile.overlayRedo',
  keys: ['Mod+Shift+Z', 'Mod+Y'],
  when: overlayShortcutWhen,
})

useShortcut({
  allowInEditorDrawer: true,
  execute: () => controller.handleCopyFrame(),
  i18nKey: 'shortcut.effect.copy',
  id: 'animationFile.overlayCopy',
  keys: 'Mod+C',
  when: overlayShortcutWhen,
})

useShortcut({
  allowInEditorDrawer: true,
  execute: () => controller.handlePasteFrame(),
  i18nKey: 'shortcut.effect.paste',
  id: 'animationFile.overlayPaste',
  keys: 'Mod+V',
  when: overlayShortcutWhen,
})

useShortcut({
  allowInEditorDrawer: true,
  execute: () => controller.handleFlipScaleAxis('x'),
  i18nKey: 'shortcut.effect.flipHorizontal',
  id: 'animationFile.overlayFlipHorizontal',
  keys: 'Shift+H',
  when: overlayShortcutWhen,
})

useShortcut({
  allowInEditorDrawer: true,
  execute: () => controller.handleFlipScaleAxis('y'),
  i18nKey: 'shortcut.effect.flipVertical',
  id: 'animationFile.overlayFlipVertical',
  keys: 'Shift+V',
  when: overlayShortcutWhen,
})
</script>

<template>
  <div
    ref="panelRef"
    data-testid="referenced-animation-editor-panel"
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
      :baseline-source="preview.session?.baselineSource"
      :baseline-transform="preview.session?.baselineTransform"
      :preview-field-value="props.previewFieldValue"
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
      @cancel-preview="preview.cancelPreview"
    />
  </div>
</template>
