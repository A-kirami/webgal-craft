import { cloneAnimationFrame } from '~/helper/animation-frame'

import type { AnimationFrame, Transform } from '~/types/stage'

export interface AnimationEditorKeyframe {
  cumulativeTime: number
  duration: number
  ease?: string
  id: number
}

export interface AnimationEffectFormState {
  transform: Transform
  duration: string
  ease: string
}

export function createAnimationEffectFormState(frame?: AnimationFrame): AnimationEffectFormState {
  if (!frame) {
    return {
      transform: {},
      duration: '0',
      ease: '',
    }
  }

  const snapshot = cloneAnimationFrame(frame)
  const {
    duration,
    ease,
    ...transform
  } = snapshot

  return {
    transform,
    duration: String(Math.max(duration, 0)),
    ease: ease ?? '',
  }
}

export function createAnimationTransformPatch(
  currentFrame: AnimationFrame,
  nextTransform: Transform,
): Partial<AnimationFrame> {
  const currentTransform = extractAnimationTransform(currentFrame)
  const nextTransformRecord = nextTransform as Record<string, unknown>
  const keys = new Set([
    ...Object.keys(currentTransform),
    ...Object.keys(nextTransformRecord),
  ])

  const patch: Partial<AnimationFrame> = {}
  for (const key of keys) {
    const currentValue = currentTransform[key]
    const nextValue = nextTransformRecord[key]
    if (isSameTransformValue(currentValue, nextValue)) {
      continue
    }

    ;(patch as Record<string, unknown>)[key] = nextValue === undefined
      ? undefined
      : structuredClone(toRaw(nextValue))
  }

  return patch
}

function extractAnimationTransform(frame: AnimationFrame): Record<string, unknown> {
  const {
    duration: _duration,
    ease: _ease,
    ...transform
  } = cloneAnimationFrame(frame)

  return transform as Record<string, unknown>
}

function isSameTransformValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
