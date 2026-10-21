import { capabilityMinimumVersion } from '~/domain/engine/runtime-capabilities'

import type { AnimationFramePreviewContext, AnimationFramePreviewNotice } from './useAnimationFramePreview'
import type { MaybeRefOrGetter } from 'vue'
import type { TransformBaselineSource } from '~/features/editor/transform-resolution/model'

export interface AnimationFramePreviewNoticeState {
  baselineResolved: boolean
  baselineSource: TransformBaselineSource
  context?: AnimationFramePreviewContext
  enableLivePreview: boolean
  hasFrame: boolean
  isOpen: boolean
  previewReady: boolean
  seekFailed: boolean
  showPreviewPanel: boolean
}

/**
 * 帧预览降级原因的唯一判定入口。
 *
 * 抽屉加载阶段还不存在预览会话，但静态原因（引擎能力、语句改写参数、实时预览开关、预览就绪）
 * 已经可以判定；加载期间先用同一规则渲染，面板挂载后只需补上基线/seek 这类动态原因。
 */
export function resolveAnimationFramePreviewNotice(
  state: AnimationFramePreviewNoticeState,
): AnimationFramePreviewNotice | undefined {
  if (!state.isOpen || !state.context || !state.showPreviewPanel) {
    return
  }
  if (!state.context.runtimeCapabilities.seekAnimation) {
    return 'engine-unsupported'
  }
  if (state.context.hasAnimationOverrides) {
    return 'v2-overrides'
  }
  if (!state.context.target.trim() || !state.hasFrame) {
    return
  }
  if (!state.enableLivePreview) {
    return 'live-preview-disabled'
  }
  if (state.seekFailed) {
    return 'seek-failed'
  }
  if (!state.previewReady) {
    return 'preview-unavailable'
  }
  if (state.baselineResolved && state.baselineSource === 'unknown') {
    return 'baseline-unavailable'
  }
}

/** 把降级原因映射为文案；语句抽屉与引用动画面板共用 */
export function useAnimationFramePreviewNotice(
  notice: MaybeRefOrGetter<AnimationFramePreviewNotice | undefined>,
) {
  const { t } = useI18n()

  return computed(() => {
    switch (toValue(notice)) {
      case 'baseline-unavailable': {
        return t('edit.visualEditor.animation.framePreview.baselineUnavailable')
      }
      case 'engine-unsupported': {
        return t('edit.visualEditor.animation.framePreview.engineUnsupported', {
          version: capabilityMinimumVersion('seekAnimation'),
        })
      }
      case 'live-preview-disabled': {
        return t('edit.visualEditor.animation.framePreview.livePreviewDisabled')
      }
      case 'preview-unavailable': {
        return t('edit.visualEditor.animation.framePreview.previewUnavailable')
      }
      case 'seek-failed': {
        return t('edit.visualEditor.animation.framePreview.seekFailed')
      }
      case 'v2-overrides': {
        return t('edit.visualEditor.animation.framePreview.v2Overrides')
      }
      default: {
        return
      }
    }
  })
}
