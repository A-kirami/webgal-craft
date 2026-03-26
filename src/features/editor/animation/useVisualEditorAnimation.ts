import { computed, reactive, toValue, watch } from 'vue'

import {
  normalizeAnimationFrameDurationInput,
  normalizeAnimationFrameEaseInput,
  resolveAnimationTimelineDurationChange,
} from '~/features/editor/animation/animation-frame-editor'
import { createAnimationTransformPatch } from '~/features/editor/animation/animation-inspector'
import { createDefaultAnimationFrame, useAnimationEditorSession } from '~/features/editor/animation/useAnimationEditorSession'
import { resolveHistoryShortcutAction } from '~/features/editor/shared/history-shortcut'

import type { MaybeRefOrGetter } from 'vue'
import type { AnimationFrame, Transform } from '~/domain/stage/types'
import type { AnimationTimelineResizeDurationPayload } from '~/features/editor/animation/animation-editor-contract'
import type { EffectEditorTransformUpdatePayload } from '~/features/editor/effect-editor/useEffectEditorProvider'

interface VisualAnimationStateLike {
  frames: readonly AnimationFrame[]
  path: string
}

interface HistoryMutationResult {
  applied: boolean
}

interface UseVisualEditorAnimationOptions {
  activeElement?: () => Element | null
  applyAnimationFrameDelete: (path: string, frameIndex: number) => void
  applyAnimationFrameInsert: (
    path: string,
    insertAfterIndex: number | undefined,
    frame: AnimationFrame,
  ) => void
  applyAnimationFrameUpdate: (
    path: string,
    frameIndex: number,
    patch: Partial<AnimationFrame>,
  ) => void
  canRedo: (path: string) => boolean
  canUndo: (path: string) => boolean
  isCurrentProjectionActive: () => boolean
  redoDocument: (path: string) => HistoryMutationResult
  scheduleAutoSaveIfEnabled: (path: string) => void
  state: MaybeRefOrGetter<VisualAnimationStateLike>
  undoDocument: (path: string) => HistoryMutationResult
}

export function useVisualEditorAnimation(options: UseVisualEditorAnimationOptions) {
  const state = computed(() => toValue(options.state))
  const session = useAnimationEditorSession(() => state.value.frames)
  let pendingTransformDraft = $ref<Transform>()
  let pendingTransformDraftFrameId = $ref<number>()

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

  function handleAddFrame(): void {
    resetSelectedFrameTransformDraft()
    resetSelectedFrameDurationDraft()

    const insertAfterIndex = session.selectedFrameIndex >= 0
      ? session.selectedFrameIndex
      : undefined
    options.applyAnimationFrameInsert(state.value.path, insertAfterIndex, createDefaultAnimationFrame())
    session.selectedFrameId = insertAfterIndex === undefined ? 1 : insertAfterIndex + 2
    options.scheduleAutoSaveIfEnabled(state.value.path)
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
    if (currentFrame?.duration === change.duration) {
      return
    }

    session.selectedFrameId = change.frameId

    if (!payload.flush) {
      scheduleSelectedFrameDurationDraft(change.frameId, change.duration)
      return
    }

    resetSelectedFrameDurationDraft()
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

  function resolveActiveElement(): Element | undefined {
    return options.activeElement?.() ?? globalThis.document?.activeElement ?? undefined
  }

  function isEditingText(): boolean {
    const element = resolveActiveElement() as HTMLElement | null
    if (!element) {
      return false
    }

    const tagName = element.tagName
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || element.isContentEditable
  }

  function isFocusInsideOverlay(): boolean {
    const element = resolveActiveElement() as HTMLElement | null
    if (!element) {
      return false
    }

    return !!element.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-side][data-state="open"]')
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

  function handleHistoryShortcutKeydown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented
      || !options.isCurrentProjectionActive()
      || isEditingText()
      || isFocusInsideOverlay()
    ) {
      return
    }

    const historyAction = resolveHistoryShortcutAction(event)
    if (!historyAction) {
      return
    }

    event.preventDefault()
    if (historyAction === 'redo') {
      handleRedo()
      return
    }

    handleUndo()
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
    handleDeleteFrame,
    handleDurationUpdate,
    handleEaseUpdate,
    handleHistoryShortcutKeydown,
    handleRedo,
    handleTimelineResizeDuration,
    handleTransformUpdate,
    handleUndo,
    dispose,
  })
}
