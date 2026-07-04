import type { Transform } from '~/types/editorPreviewProtocol'

export type { Point2D, Transform } from '~/types/editorPreviewProtocol'

export type AnimationFrame = Transform & { duration: number, ease?: string }
