import type { Transform } from '~/domain/stage/types'
import type { TransformBaselineSource } from '~/features/editor/transform-resolution/model'

/** 变换浮层只消费会话中的显示态字段，效果编辑器与动画帧编辑器共用这份契约 */
export interface TransformOverlaySession {
  sessionId: number
  effectTarget: string
  baselineResolved: boolean
  baselineSource: TransformBaselineSource
  baselineTransform?: Transform
  draft: {
    transform: Transform
  }
}

export interface TransformOverlayDraftPatch {
  transform: Transform
}

export interface TransformOverlayDraftOptions {
  deferAutoApply?: boolean
}

export interface TransformOverlayPreviewPayload {
  flush?: boolean
}

/**
 * 预览面板拖拽的写入端。效果编辑器直接实现它，动画帧会话用同一份接口把提交落到当前帧。
 * session 为空表示该来源当前不接管浮层，桥接会回退到另一个来源。
 */
export interface TransformOverlayProvider {
  readonly session: TransformOverlaySession | undefined
  cancelPreview: () => void | Promise<void>
  requestPreview: (payload: TransformOverlayPreviewPayload) => void
  updateDraft: (patch: TransformOverlayDraftPatch, options?: TransformOverlayDraftOptions) => void
  updatePreviewTransform: (transform: Transform | (() => Transform)) => void
}
