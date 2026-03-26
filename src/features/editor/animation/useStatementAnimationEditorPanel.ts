import { reactive, toValue, watch } from 'vue'

import {
  deleteAnimationFrameAtSelection,
  insertAnimationFrameAfterSelection,
  normalizeAnimationFrameDurationInput,
  normalizeAnimationFrameEaseInput,
  resolveAnimationTimelineDurationChange,
  updateAnimationFrameAt,
} from '~/features/editor/animation/animation-frame-editor'
import { createAnimationTransformPatch } from '~/features/editor/animation/animation-inspector'
import { createDefaultAnimationFrame, useAnimationEditorSession } from '~/features/editor/animation/useAnimationEditorSession'

import type { MaybeRefOrGetter } from 'vue'
import type { AnimationFrame } from '~/domain/stage/types'
import type { AnimationTimelineResizeDurationPayload } from '~/features/editor/animation/animation-editor-contract'
import type { EffectEditorTransformUpdatePayload } from '~/features/editor/effect-editor/useEffectEditorProvider'

interface UseStatementAnimationEditorPanelOptions {
  emitFrames: (frames: AnimationFrame[]) => void
  frames: MaybeRefOrGetter<readonly AnimationFrame[]>
}

export function useStatementAnimationEditorPanel(options: UseStatementAnimationEditorPanelOptions) {
  const session = useAnimationEditorSession(() => toValue(options.frames))

  watch(
    () => session.selectedFrameId,
    session.resetSelectedFrameDrafts,
  )

  function updateFrame(frameIndex: number, patch: Partial<AnimationFrame>): void {
    const nextFrames = updateAnimationFrameAt(toValue(options.frames), frameIndex, patch)
    if (!nextFrames) {
      return
    }

    options.emitFrames(nextFrames)
  }

  function handleAddFrame(): void {
    const result = insertAnimationFrameAfterSelection(
      toValue(options.frames),
      session.selectedFrameIndex,
      createDefaultAnimationFrame(),
    )

    options.emitFrames(result.nextFrames)
    session.selectedFrameId = result.selectedFrameId
  }

  function handleDeleteFrame(): void {
    const result = deleteAnimationFrameAtSelection(toValue(options.frames), session.selectedFrameIndex)
    if (!result) {
      return
    }

    session.resetSelectedFrameDrafts()
    options.emitFrames(result.nextFrames)
    session.selectedFrameId = result.selectedFrameId
  }

  function handleTransformUpdate(payload: EffectEditorTransformUpdatePayload): void {
    if (!payload.flush) {
      session.setSelectedFrameTransformDraft(payload.value)
      return
    }

    const currentFrame = session.selectedFrame
    if (!currentFrame) {
      return
    }

    updateFrame(session.selectedFrameIndex, createAnimationTransformPatch(currentFrame, payload.value))
    session.resetSelectedFrameTransformDraft()
  }

  function handleDurationUpdate(value: string): void {
    const nextDuration = normalizeAnimationFrameDurationInput(value)
    if (nextDuration === undefined || session.selectedFrameIndex < 0) {
      return
    }

    session.resetSelectedFrameDurationDraft()
    updateFrame(session.selectedFrameIndex, { duration: nextDuration })
  }

  function handleTimelineResizeDuration(payload: AnimationTimelineResizeDurationPayload): void {
    const change = resolveAnimationTimelineDurationChange(toValue(options.frames), payload)
    if (!change) {
      return
    }

    session.selectedFrameId = change.frameId

    if (!payload.flush) {
      session.setSelectedFrameDurationDraft(change.frameId, change.duration)
      return
    }

    session.resetSelectedFrameDurationDraft()
    updateFrame(change.frameIndex, { duration: change.duration })
  }

  function handleEaseUpdate(value: string): void {
    if (session.isSelectedFrameEaseDisabled || session.selectedFrameIndex < 0) {
      return
    }

    updateFrame(session.selectedFrameIndex, { ease: normalizeAnimationFrameEaseInput(value) })
  }

  return reactive({
    session,
    handleAddFrame,
    handleDeleteFrame,
    handleTransformUpdate,
    handleDurationUpdate,
    handleTimelineResizeDuration,
    handleEaseUpdate,
  })
}
