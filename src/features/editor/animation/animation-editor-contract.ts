import type { Transform } from '~/domain/stage/types'

export interface AnimationTimelineResizeDurationPayload {
  duration: number
  flush: boolean
  id: number
}

export interface AnimationEditorSelectedFrameState {
  duration: string
  ease: string
  id: number
  isEaseDisabled: boolean
  isStartFrame: boolean
  transform: Transform
}
