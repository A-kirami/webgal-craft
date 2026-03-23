import type { AnimationFrame } from '~/types/stage'

export function cloneAnimationFrame<T extends Partial<AnimationFrame>>(frame: T): T {
  return structuredClone(toRaw(frame))
}

export function cloneAnimationFrames(frames: readonly AnimationFrame[]): AnimationFrame[] {
  return frames.map(frame => cloneAnimationFrame(frame))
}
