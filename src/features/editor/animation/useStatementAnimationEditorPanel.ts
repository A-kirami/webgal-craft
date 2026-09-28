import { reactive, toValue, watch } from 'vue'

import { cloneAnimationFrames } from '~/domain/stage/animation-frame'
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
  const undoStack: AnimationFrame[][] = []
  const redoStack: AnimationFrame[][] = []

  watch(
    () => session.selectedFrameId,
    session.resetSelectedFrameDrafts,
  )

  /**
   * 草稿改动的唯一入口：提交前记录改动前的整份帧，供撤销/重做回放。
   * 面板只把已提交的改动交给宿主（拖拽中的中间值留在 session 草稿里），所以每次提交正好一条历史。
   */
  function commitFrames(nextFrames: AnimationFrame[]): void {
    undoStack.push(cloneAnimationFrames(toValue(options.frames)))
    redoStack.length = 0
    options.emitFrames(nextFrames)
  }

  function restoreFrames(frames: AnimationFrame[]): void {
    session.resetSelectedFrameDrafts()
    // 历史快照本身就是克隆，宿主写入草稿时还会再克隆一次
    options.emitFrames(frames)
  }

  function handleUndo(): void {
    const previousFrames = undoStack.pop()
    if (!previousFrames) {
      return
    }

    redoStack.push(cloneAnimationFrames(toValue(options.frames)))
    restoreFrames(previousFrames)
  }

  function handleRedo(): void {
    const nextFrames = redoStack.pop()
    if (!nextFrames) {
      return
    }

    undoStack.push(cloneAnimationFrames(toValue(options.frames)))
    restoreFrames(nextFrames)
  }

  function updateFrame(frameIndex: number, patch: Partial<AnimationFrame>): void {
    const nextFrames = updateAnimationFrameAt(toValue(options.frames), frameIndex, patch)
    if (!nextFrames) {
      return
    }

    commitFrames(nextFrames)
  }

  function handleAddFrame(): void {
    const result = insertAnimationFrameAfterSelection(
      toValue(options.frames),
      session.selectedFrameIndex,
      createDefaultAnimationFrame(),
    )

    commitFrames(result.nextFrames)
    session.selectedFrameId = result.selectedFrameId
  }

  function handleDeleteFrame(): void {
    const result = deleteAnimationFrameAtSelection(toValue(options.frames), session.selectedFrameIndex)
    if (!result) {
      return
    }

    session.resetSelectedFrameDrafts()
    commitFrames(result.nextFrames)
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
    handleDurationUpdate,
    handleEaseUpdate,
    handleRedo,
    handleTimelineResizeDuration,
    handleTransformUpdate,
    handleUndo,
  })
}
