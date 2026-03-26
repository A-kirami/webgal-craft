import { cloneAnimationFrame, cloneAnimationFrames } from './animation-frame'

import type { AnimationFrame } from '~/types/stage'

export interface AnimationTimelineDurationChange {
  duration: number
  frameId: number
  frameIndex: number
}

export interface AnimationFrameMutationResult {
  nextFrames: AnimationFrame[]
  selectedFrameId: number
}

export function insertAnimationFrameAfterSelection(
  frames: readonly AnimationFrame[],
  selectedFrameIndex: number,
  frame: AnimationFrame,
): AnimationFrameMutationResult {
  const nextFrames = cloneAnimationFrames(frames)
  const insertIndex = selectedFrameIndex >= 0 ? selectedFrameIndex + 1 : nextFrames.length
  nextFrames.splice(insertIndex, 0, cloneAnimationFrame(frame))

  return {
    nextFrames,
    selectedFrameId: insertIndex + 1,
  }
}

export function deleteAnimationFrameAtSelection(
  frames: readonly AnimationFrame[],
  selectedFrameIndex: number,
): AnimationFrameMutationResult | undefined {
  if (selectedFrameIndex < 0) {
    return
  }

  const nextFrames = frames
    .filter((_, index) => index !== selectedFrameIndex)
    .map(frame => cloneAnimationFrame(frame))
  const nextSelectedIndex = Math.min(selectedFrameIndex, nextFrames.length - 1)

  return {
    nextFrames,
    selectedFrameId: nextSelectedIndex >= 0 ? nextSelectedIndex + 1 : 1,
  }
}

export function updateAnimationFrameAt(
  frames: readonly AnimationFrame[],
  frameIndex: number,
  patch: Partial<AnimationFrame>,
): AnimationFrame[] | undefined {
  const currentFrame = frames[frameIndex]
  if (!currentFrame || Object.keys(patch).length === 0) {
    return
  }

  return frames.map((frame, index) => {
    if (index !== frameIndex) {
      return cloneAnimationFrame(frame)
    }

    return {
      ...cloneAnimationFrame(frame),
      ...patch,
    }
  })
}

export function normalizeAnimationFrameDurationInput(value: string): number | undefined {
  const normalizedValue = value.trim()
  const nextDuration = normalizedValue === '' ? 0 : Number(normalizedValue)

  if (!Number.isFinite(nextDuration) || nextDuration < 0) {
    return
  }

  return nextDuration
}

export function resolveAnimationTimelineDurationChange(
  frames: readonly AnimationFrame[],
  payload: { duration: number, id: number },
): AnimationTimelineDurationChange | undefined {
  const frameIndex = payload.id - 1
  if (!frames[frameIndex]) {
    return
  }

  return {
    duration: Math.max(0, Math.round(payload.duration)),
    frameId: payload.id,
    frameIndex,
  }
}

export function normalizeAnimationFrameEaseInput(value: string): string | undefined {
  return value.trim() || undefined
}
