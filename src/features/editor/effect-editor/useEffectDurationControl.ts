import { usePointerDrag } from '~/composables/usePointerDrag'
import { applyScrubStepModifier } from '~/utils/math'

interface UseEffectDurationControlOptions {
  getDuration: () => string
  emitDuration: (value: string) => void
  emitEase: (value: string) => void
  defaultEaseValue: string
}

export function useEffectDurationControl(options: UseEffectDurationControlOptions) {
  let pendingDurationValue: string | undefined
  let pendingDurationFrameId: number | undefined
  let suppressDurationCommitOnEnd = false

  function updateDuration(value: string | number) {
    options.emitDuration(String(value ?? ''))
  }

  function cancelScheduledDurationEmit() {
    if (pendingDurationFrameId === undefined) {
      return
    }

    cancelAnimationFrame(pendingDurationFrameId)
    pendingDurationFrameId = undefined
  }

  function flushPendingDurationEmit(): string | undefined {
    if (pendingDurationValue === undefined) {
      cancelScheduledDurationEmit()
      return
    }

    const nextValue = pendingDurationValue
    cancelScheduledDurationEmit()
    updateDuration(nextValue)
    pendingDurationValue = undefined
    return nextValue
  }

  function scheduleDurationEmit(value: string | number) {
    pendingDurationValue = String(value ?? '')
    if (pendingDurationFrameId !== undefined) {
      return
    }

    pendingDurationFrameId = requestAnimationFrame(() => {
      pendingDurationFrameId = undefined
      if (pendingDurationValue === undefined) {
        return
      }

      updateDuration(pendingDurationValue)
      pendingDurationValue = undefined
    })
  }

  function getDurationNumberValue(): number {
    const duration = Number(options.getDuration())
    return (Number.isFinite(duration) && duration >= 0) ? duration : 0
  }

  function resolveDurationScrubStep(event: PointerEvent): number {
    return applyScrubStepModifier(1, event, { altFactor: 1, shiftFactor: 10 })
  }

  const durationScrub = usePointerDrag<{
    lastValue: number
    startValue: number
    startX: number
  }>({
    onStart(event) {
      if (event.button !== 0 || event.pointerType === 'touch') {
        return
      }

      const startValue = getDurationNumberValue()
      return {
        startX: event.clientX,
        startValue,
        lastValue: startValue,
      }
    },
    onMove(event, state) {
      const step = resolveDurationScrubStep(event)
      const deltaX = event.clientX - state.startX
      const nextValue = Math.max(0, Math.round(state.startValue + (deltaX * step)))
      if (nextValue === state.lastValue) {
        return
      }

      state.lastValue = nextValue
      scheduleDurationEmit(nextValue)
    },
    onEnd(_event, state) {
      const flushedValue = flushPendingDurationEmit()
      const finalValue = Math.max(0, Math.round(state.lastValue))
      if (suppressDurationCommitOnEnd) {
        suppressDurationCommitOnEnd = false
        return
      }

      const normalizedFinalValue = String(finalValue)
      if (flushedValue === normalizedFinalValue || options.getDuration() === normalizedFinalValue) {
        return
      }

      updateDuration(normalizedFinalValue)
    },
  })

  function handleDurationLabelPointerDown(event: PointerEvent) {
    event.preventDefault()
    durationScrub.start(event)
  }

  function updateEase(value: unknown) {
    const nextValue = String(value ?? '')
    options.emitEase(nextValue === options.defaultEaseValue ? '' : nextValue)
  }

  return {
    updateDuration,
    handleDurationLabelPointerDown,
    updateEase,
    stopDurationScrub: () => {
      suppressDurationCommitOnEnd = true
      durationScrub.stop()
      cancelScheduledDurationEmit()
      pendingDurationValue = undefined
    },
  }
}
