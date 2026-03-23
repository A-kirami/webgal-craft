import { computed, reactive, shallowRef, toValue, watch } from 'vue'

import { createAnimationEffectFormState } from './animation-inspector'

import type { AnimationEditorSelectedFrameState } from './animation-editor-contract'
import type { AnimationEditorKeyframe } from './animation-inspector'
import type { MaybeRefOrGetter } from 'vue'
import type { AnimationFrame, Transform } from '~/types/stage'

interface AnimationEditorDurationDraft {
  duration: number
  frameId: number
}

export function createDefaultAnimationFrame(): AnimationFrame {
  return {
    duration: 0,
  }
}

export function useAnimationEditorSession(framesSource: MaybeRefOrGetter<readonly AnimationFrame[]>) {
  const selectedFrameId = shallowRef(1)
  const timelineZoomPercent = shallowRef(100)
  const selectedFrameTransformDraft = shallowRef<Transform>()
  const selectedFrameDurationDraft = shallowRef<AnimationEditorDurationDraft>()

  const frames = computed(() => toValue(framesSource))
  const keyframes = computed<AnimationEditorKeyframe[]>(() => {
    let cumulativeTime = 0

    return frames.value.map((frame, index) => {
      const frameId = index + 1
      const nextDuration = selectedFrameDurationDraft.value?.frameId === frameId
        ? selectedFrameDurationDraft.value.duration
        : Math.max(frame.duration, 0)
      cumulativeTime += nextDuration

      return {
        cumulativeTime,
        duration: nextDuration,
        ease: frame.ease?.trim() || undefined,
        id: frameId,
      }
    })
  })
  const selectedKeyframe = computed(() => {
    return keyframes.value.find(frame => frame.id === selectedFrameId.value) ?? keyframes.value[0]
  })
  const selectedFrameIndex = computed(() => {
    return selectedKeyframe.value ? selectedKeyframe.value.id - 1 : -1
  })
  const selectedFrame = computed(() => {
    const frameIndex = selectedFrameIndex.value
    return frameIndex >= 0 ? frames.value[frameIndex] : undefined
  })
  const isFirstKeyframe = computed(() => selectedKeyframe.value?.id === 1)
  const selectedFrameResolvedDuration = computed(() => {
    if (selectedFrameDurationDraft.value?.frameId === selectedFrameId.value) {
      return selectedFrameDurationDraft.value.duration
    }
    return Math.max(selectedFrame.value?.duration ?? 0, 0)
  })
  const isSelectedFrameEaseDisabled = computed(() => {
    return isFirstKeyframe.value || selectedFrameResolvedDuration.value <= 0
  })
  const canDeleteFrame = computed(() => selectedFrameIndex.value >= 0)
  const selectedFrameFormState = computed(() => {
    const baseState = createAnimationEffectFormState(selectedFrame.value)
    if (selectedFrameDurationDraft.value?.frameId !== selectedFrameId.value) {
      return baseState
    }

    return {
      ...baseState,
      duration: String(selectedFrameResolvedDuration.value),
    }
  })
  const selectedFrameTransform = computed(() => {
    return selectedFrameTransformDraft.value ?? selectedFrameFormState.value.transform
  })
  const selectedFrameState = computed<AnimationEditorSelectedFrameState | undefined>(() => {
    if (!selectedKeyframe.value) {
      return
    }

    return {
      duration: selectedFrameFormState.value.duration,
      ease: selectedFrameFormState.value.ease,
      id: selectedKeyframe.value.id,
      isEaseDisabled: isSelectedFrameEaseDisabled.value,
      isStartFrame: isFirstKeyframe.value,
      transform: selectedFrameTransform.value,
    }
  })
  const totalDuration = computed(() => keyframes.value.at(-1)?.cumulativeTime ?? 0)

  watch(
    () => keyframes.value.map(frame => frame.id),
    (ids) => {
      if (ids.length === 0) {
        selectedFrameId.value = 1
        return
      }

      if (!ids.includes(selectedFrameId.value)) {
        selectedFrameId.value = ids[0] ?? 1
      }
    },
    { immediate: true },
  )

  function resetSelectedFrameTransformDraft(): void {
    selectedFrameTransformDraft.value = undefined
  }

  function resetSelectedFrameDurationDraft(): void {
    selectedFrameDurationDraft.value = undefined
  }

  function resetSelectedFrameDrafts(): void {
    resetSelectedFrameTransformDraft()
    resetSelectedFrameDurationDraft()
  }

  function setSelectedFrameTransformDraft(transform?: Transform): void {
    selectedFrameTransformDraft.value = transform
  }

  function setSelectedFrameDurationDraft(frameId: number, duration: number): void {
    selectedFrameDurationDraft.value = {
      duration,
      frameId,
    }
  }

  return reactive({
    canDeleteFrame,
    isFirstKeyframe,
    isSelectedFrameEaseDisabled,
    keyframes,
    resetSelectedFrameDrafts,
    resetSelectedFrameDurationDraft,
    resetSelectedFrameTransformDraft,
    selectedFrame,
    selectedFrameDurationDraft,
    selectedFrameId,
    selectedFrameIndex,
    selectedFrameResolvedDuration,
    selectedFrameState,
    selectedFrameTransformDraft,
    setSelectedFrameDurationDraft,
    setSelectedFrameTransformDraft,
    timelineZoomPercent,
    totalDuration,
  })
}
