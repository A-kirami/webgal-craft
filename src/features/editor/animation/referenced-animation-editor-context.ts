import type { AnimationFramePreviewContext } from './useAnimationFramePreview'
import type { InjectionKey } from 'vue'
import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { AbsPath } from '~/domain/path'
import type { TransformOverlayProvider } from '~/features/editor/transform-overlay/provider'

export interface ReferencedAnimationEditorOpenContext {
  /** 语句侧算出的帧预览上下文；缺少目标或句柄时为 undefined，抽屉仍可编辑但不建预览 */
  framePreview?: AnimationFramePreviewContext
  scenePath: AbsPath
  statementId: number
}

/** 由抽屉宿主提供：语句编辑器只负责把当前 setAnimation 语句交给抽屉 */
export type ReferencedAnimationEditorOpen = (
  parsed: ISentence,
  context: ReferencedAnimationEditorOpenContext,
) => void

export const REFERENCED_ANIMATION_EDITOR_OPEN_KEY: InjectionKey<ReferencedAnimationEditorOpen> =
  Symbol('referencedAnimationEditorOpen')

/** 引用动画面板的帧预览写入端：面板挂载时注册，桥接按它决定浮层是否交给引用动画的帧预览 */
export interface ReferencedAnimationPreviewRegistry {
  register: (provider: TransformOverlayProvider) => void
  unregister: (provider: TransformOverlayProvider) => void
}

export const REFERENCED_ANIMATION_PREVIEW_KEY: InjectionKey<ReferencedAnimationPreviewRegistry> =
  Symbol('referencedAnimationPreview')
