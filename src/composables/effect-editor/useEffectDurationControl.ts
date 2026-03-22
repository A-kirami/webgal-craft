import { usePointerDrag } from '~/composables/usePointerDrag'
import { applyScrubStepModifier } from '~/helper/math'

interface UseEffectDurationControlOptions {
  getDuration: () => string
  emitDuration: (value: string) => void
  emitEase: (value: string) => void
  defaultEaseValue: string
}

export function useEffectDurationControl(options: UseEffectDurationControlOptions) {
  function updateDuration(value: string | number) {
    options.emitDuration(String(value ?? ''))
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
      updateDuration(nextValue)
    },
    onEnd(_event, state) {
      const finalValue = Math.max(0, Math.round(state.lastValue))
      updateDuration(finalValue)
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
    stopDurationScrub: () => durationScrub.stop(),
  }
}
