import { computed, reactive, toValue, watch } from 'vue'

import { cloneAnimationFrame } from '~/domain/stage/animation-frame'
import {
  normalizeAnimationFrameDurationInput,
  normalizeAnimationFrameEaseInput,
  resolveAnimationTimelineDurationChange,
} from '~/features/editor/animation/animation-frame-editor'
import { createAnimationTransformPatch } from '~/features/editor/animation/animation-inspector'
import { createDefaultAnimationFrame, useAnimationEditorSession } from '~/features/editor/animation/useAnimationEditorSession'
import { flipTransformScaleAxis } from '~/features/editor/effect-editor/transform-flip'

import type { MaybeRefOrGetter } from 'vue'
import type { AbsPath } from '~/domain/path'
import type { AnimationFrame, Transform } from '~/domain/stage/types'
import type { AnimationTimelineResizeDurationPayload } from '~/features/editor/animation/animation-editor-contract'
import type { TransformScaleAxis } from '~/features/editor/effect-editor/transform-flip'
import type { EffectEditorTransformUpdatePayload } from '~/features/editor/effect-editor/useEffectEditorProvider'

interface VisualAnimationStateLike {
  frames: readonly AnimationFrame[]
  path: AbsPath
}

interface HistoryMutationResult {
  applied: boolean
}

interface UseVisualEditorAnimationOptions {
  applyAnimationFrameDelete: (path: AbsPath, frameIndex: number) => void
  applyAnimationFrameInsert: (
    path: AbsPath,
    insertAfterIndex: number | undefined,
    frame: AnimationFrame,
  ) => void
  applyAnimationFrameReorder: (path: AbsPath, fromIndex: number, toIndex: number) => void
  applyAnimationFrameUpdate: (
    path: AbsPath,
    frameIndex: number,
    patch: Partial<AnimationFrame>,
  ) => void
  canRedo: (path: AbsPath) => boolean
  canUndo: (path: AbsPath) => boolean
  redoDocument: (path: AbsPath) => HistoryMutationResult
  scheduleAutoSaveIfEnabled: (path: AbsPath) => void
  state: MaybeRefOrGetter<VisualAnimationStateLike>
  undoDocument: (path: AbsPath) => HistoryMutationResult
}

export function useVisualEditorAnimation(options: UseVisualEditorAnimationOptions) {
  const state = computed(() => toValue(options.state))
  const session = useAnimationEditorSession(() => state.value.frames)
  let pendingTransformDraft = $ref<Transform>()
  let pendingTransformDraftFrameId = $ref<number>()
  // 剪贴板只属于当前编辑会话：动画可视化投影与其他动画编辑器宿主各自复制、各自粘贴
  let frameClipboard: AnimationFrame | undefined

  const canUndo = computed(() => options.canUndo(state.value.path))
  const canRedo = computed(() => options.canRedo(state.value.path))

  watch(
    () => state.value.path,
    session.resetSelectedFrameDrafts,
  )

  watch(
    () => session.selectedFrameId,
    resetSelectedFrameTransformDraft,
  )

  function flushPendingTransformDraft(): void {
    if (pendingTransformDraftFrameId === undefined) {
      return
    }

    globalThis.cancelAnimationFrame(pendingTransformDraftFrameId)
    pendingTransformDraftFrameId = undefined
    session.setSelectedFrameTransformDraft(pendingTransformDraft)
    pendingTransformDraft = undefined
  }

  function scheduleSelectedFrameTransformDraft(nextTransform: Transform): void {
    pendingTransformDraft = nextTransform
    if (pendingTransformDraftFrameId !== undefined) {
      return
    }

    pendingTransformDraftFrameId = globalThis.requestAnimationFrame(() => {
      pendingTransformDraftFrameId = undefined
      session.setSelectedFrameTransformDraft(pendingTransformDraft)
      pendingTransformDraft = undefined
    })
  }

  function scheduleSelectedFrameDurationDraft(frameId: number, nextDuration: number): void {
    session.setSelectedFrameDurationDraft(frameId, nextDuration)
  }

  function resetSelectedFrameTransformDraft(): void {
    if (pendingTransformDraftFrameId !== undefined) {
      globalThis.cancelAnimationFrame(pendingTransformDraftFrameId)
      pendingTransformDraftFrameId = undefined
    }

    pendingTransformDraft = undefined
    session.resetSelectedFrameTransformDraft()
  }

  function resetSelectedFrameDurationDraft(): void {
    session.resetSelectedFrameDurationDraft()
  }

  function applySelectedFramePatch(patch: Partial<AnimationFrame>): void {
    const frameIndex = session.selectedFrameIndex
    if (frameIndex < 0 || Object.keys(patch).length === 0) {
      return
    }

    options.applyAnimationFrameUpdate(state.value.path, frameIndex, patch)
    options.scheduleAutoSaveIfEnabled(state.value.path)
  }

  function insertFrameAfterSelection(frame: AnimationFrame): void {
    resetSelectedFrameTransformDraft()
    resetSelectedFrameDurationDraft()

    const insertAfterIndex = session.selectedFrameIndex >= 0
      ? session.selectedFrameIndex
      : undefined
    options.applyAnimationFrameInsert(state.value.path, insertAfterIndex, frame)
    session.selectedFrameId = insertAfterIndex === undefined ? 1 : insertAfterIndex + 2
    options.scheduleAutoSaveIfEnabled(state.value.path)
  }

  function handleAddFrame(): void {
    insertFrameAfterSelection(createDefaultAnimationFrame())
  }

  function handleDeleteFrame(): void {
    const frameIndex = session.selectedFrameIndex
    if (frameIndex < 0) {
      return
    }

    resetSelectedFrameTransformDraft()
    resetSelectedFrameDurationDraft()

    const nextSelectedIndex = Math.min(frameIndex, state.value.frames.length - 2)
    options.applyAnimationFrameDelete(state.value.path, frameIndex)
    session.selectedFrameId = nextSelectedIndex >= 0 ? nextSelectedIndex + 1 : 1
    options.scheduleAutoSaveIfEnabled(state.value.path)
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
    const frameIndex = session.selectedFrameIndex
    const targetIndex = frameIndex + offset
    if (frameIndex < 0 || targetIndex < 0 || targetIndex >= state.value.frames.length) {
      return
    }

    resetSelectedFrameTransformDraft()
    resetSelectedFrameDurationDraft()
    options.applyAnimationFrameReorder(state.value.path, frameIndex, targetIndex)
    session.selectedFrameId = targetIndex + 1
    options.scheduleAutoSaveIfEnabled(state.value.path)
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
      scheduleSelectedFrameTransformDraft(payload.value)
      return
    }

    flushPendingTransformDraft()

    const currentFrame = session.selectedFrame
    if (!currentFrame) {
      return
    }

    applySelectedFramePatch(createAnimationTransformPatch(currentFrame, payload.value))
    resetSelectedFrameTransformDraft()
  }

  function handleDurationUpdate(value: string): void {
    const nextDuration = normalizeAnimationFrameDurationInput(value)
    if (nextDuration === undefined || session.selectedFrameResolvedDuration === nextDuration) {
      return
    }

    resetSelectedFrameDurationDraft()
    applySelectedFramePatch({ duration: nextDuration })
  }

  function handleTimelineResizeDuration(payload: AnimationTimelineResizeDurationPayload): void {
    const change = resolveAnimationTimelineDurationChange(state.value.frames, payload)
    if (!change) {
      return
    }

    const currentFrame = state.value.frames[change.frameIndex]
    const persistedDuration = Math.max(currentFrame?.duration ?? 0, 0)
    const draftDuration = session.selectedFrameDurationDraft?.frameId === change.frameId
      ? session.selectedFrameDurationDraft.duration
      : undefined
    const resolvedDuration = draftDuration ?? persistedDuration

    session.selectedFrameId = change.frameId

    if (!payload.flush) {
      if (resolvedDuration === change.duration) {
        return
      }

      scheduleSelectedFrameDurationDraft(change.frameId, change.duration)
      return
    }

    resetSelectedFrameDurationDraft()
    if (persistedDuration === change.duration) {
      return
    }

    options.applyAnimationFrameUpdate(state.value.path, change.frameIndex, { duration: change.duration })
    options.scheduleAutoSaveIfEnabled(state.value.path)
  }

  function handleEaseUpdate(value: string): void {
    if (session.isSelectedFrameEaseDisabled) {
      return
    }

    const nextEase = normalizeAnimationFrameEaseInput(value)
    const currentEase = session.selectedFrame?.ease?.trim() || undefined
    if (currentEase === nextEase) {
      return
    }

    applySelectedFramePatch({ ease: nextEase })
  }

  function handleUndo(): void {
    resetSelectedFrameTransformDraft()
    resetSelectedFrameDurationDraft()
    if (!options.undoDocument(state.value.path).applied) {
      return
    }

    options.scheduleAutoSaveIfEnabled(state.value.path)
  }

  function handleRedo(): void {
    resetSelectedFrameTransformDraft()
    resetSelectedFrameDurationDraft()
    if (!options.redoDocument(state.value.path).applied) {
      return
    }

    options.scheduleAutoSaveIfEnabled(state.value.path)
  }

  function dispose(): void {
    resetSelectedFrameTransformDraft()
    resetSelectedFrameDurationDraft()
  }

  return reactive({
    canRedo,
    canUndo,
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
    dispose,
  })
}
