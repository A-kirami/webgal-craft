import { reactive, toValue, watch } from 'vue'

import { cloneAnimationFrame, cloneAnimationFrames } from '~/domain/stage/animation-frame'
import {
  deleteAnimationFrameAtSelection,
  insertAnimationFrameAfterSelection,
  moveAnimationFrameAtSelection,
  normalizeAnimationFrameDurationInput,
  normalizeAnimationFrameEaseInput,
  resolveAnimationTimelineDurationChange,
  updateAnimationFrameAt,
} from '~/features/editor/animation/animation-frame-editor'
import { createAnimationTransformPatch } from '~/features/editor/animation/animation-inspector'
import { createDefaultAnimationFrame, useAnimationEditorSession } from '~/features/editor/animation/useAnimationEditorSession'
import { flipTransformScaleAxis } from '~/features/editor/effect-editor/transform-flip'

import type { MaybeRefOrGetter } from 'vue'
import type { AnimationFrame } from '~/domain/stage/types'
import type { AnimationTimelineResizeDurationPayload } from '~/features/editor/animation/animation-editor-contract'
import type { TransformScaleAxis } from '~/features/editor/effect-editor/transform-flip'
import type { EffectEditorTransformUpdatePayload } from '~/features/editor/effect-editor/useEffectEditorProvider'

interface UseStatementAnimationEditorPanelOptions {
  emitFrames: (frames: AnimationFrame[]) => void
  frames: MaybeRefOrGetter<readonly AnimationFrame[]>
}

export function useStatementAnimationEditorPanel(options: UseStatementAnimationEditorPanelOptions) {
  const session = useAnimationEditorSession(() => toValue(options.frames))
  const undoStack: AnimationFrame[][] = []
  const redoStack: AnimationFrame[][] = []
  // 剪贴板跟着这份草稿走：抽屉与模态框各自持有独立面板，互不污染对方的帧列表
  let frameClipboard: AnimationFrame | undefined

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

  function insertFrameAfterSelection(frame: AnimationFrame): void {
    const result = insertAnimationFrameAfterSelection(
      toValue(options.frames),
      session.selectedFrameIndex,
      frame,
    )

    commitFrames(result.nextFrames)
    session.selectedFrameId = result.selectedFrameId
  }

  function handleAddFrame(): void {
    insertFrameAfterSelection(createDefaultAnimationFrame())
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

  function handleCopyFrame(): void {
    const frame = session.selectedFrame
    if (!frame) {
      return
    }

    frameClipboard = cloneAnimationFrame(frame)
  }

  function handleCutFrame(): void {
    if (!session.selectedFrame) {
      return
    }

    handleCopyFrame()
    handleDeleteFrame()
  }

  function handlePasteFrame(): void {
    if (frameClipboard) {
      insertFrameAfterSelection(frameClipboard)
    }
  }

  function handleDuplicateFrame(): void {
    const frame = session.selectedFrame
    if (frame) {
      insertFrameAfterSelection(frame)
    }
  }

  function handleMoveFrame(offset: -1 | 1): void {
    const result = moveAnimationFrameAtSelection(
      toValue(options.frames),
      session.selectedFrameIndex,
      offset,
    )
    if (!result) {
      return
    }

    commitFrames(result.nextFrames)
    session.selectedFrameId = result.selectedFrameId
  }

  function handleSelectFirstFrame(): void {
    if (session.keyframes.length > 0) {
      session.selectedFrameId = 1
    }
  }

  function handleSelectLastFrame(): void {
    const lastKeyframe = session.keyframes.at(-1)
    if (lastKeyframe) {
      session.selectedFrameId = lastKeyframe.id
    }
  }

  function handleFlipScaleAxis(axis: TransformScaleAxis): void {
    const selectedFrame = session.selectedFrameState
    if (!selectedFrame) {
      return
    }

    handleTransformUpdate({
      flush: true,
      value: flipTransformScaleAxis({
        axis,
        transform: selectedFrame.transform,
      }),
    })
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
    handleCopyFrame,
    handleCutFrame,
    handleDeleteFrame,
    handleDuplicateFrame,
    handleDurationUpdate,
    handleEaseUpdate,
    handleFlipScaleAxis,
    handleMoveFrame,
    handlePasteFrame,
    handleRedo,
    handleSelectFirstFrame,
    handleSelectLastFrame,
    handleTimelineResizeDuration,
    handleTransformUpdate,
    handleUndo,
  })
}
