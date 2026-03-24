import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dragRuntime } = vi.hoisted(() => ({
  dragRuntime: {
    callbacks: undefined as undefined | {
      onEnd: (event: PointerEvent | undefined, state: { lastValue: number, startValue: number, startX: number }) => void
      onMove: (event: PointerEvent, state: { lastValue: number, startValue: number, startX: number }) => void
      onStart: (event: PointerEvent) => { lastValue: number, startValue: number, startX: number } | undefined
    },
    state: undefined as undefined | { lastValue: number, startValue: number, startX: number },
    stop: undefined as undefined | ((event?: PointerEvent) => void),
  },
}))

vi.mock('~/composables/usePointerDrag', () => ({
  usePointerDrag<S>(callbacks: {
    onEnd: (event: PointerEvent | undefined, state: S) => void
    onMove: (event: PointerEvent, state: S) => void
    onStart: (event: PointerEvent) => S | undefined
  }) {
    dragRuntime.callbacks = callbacks as typeof dragRuntime.callbacks
    dragRuntime.stop = (event?: PointerEvent) => {
      if (!dragRuntime.state) {
        return
      }

      const currentState = dragRuntime.state
      dragRuntime.state = undefined
      callbacks.onEnd(event, currentState as S)
    }

    return {
      get active() {
        return dragRuntime.state !== undefined
      },
      get state() {
        return dragRuntime.state as S | undefined
      },
      start(event: PointerEvent) {
        dragRuntime.state = callbacks.onStart(event) as typeof dragRuntime.state
        return dragRuntime.state !== undefined
      },
      stop(event?: PointerEvent) {
        dragRuntime.stop?.(event)
      },
    }
  },
}))

import { useEffectDurationControl } from '~/composables/effect-editor/useEffectDurationControl'

function createPointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    button: 0,
    clientX: 0,
    pointerId: 1,
    pointerType: 'mouse',
    preventDefault: vi.fn(),
    ...overrides,
  } as PointerEvent
}

describe('useEffectDurationControl', () => {
  beforeEach(() => {
    dragRuntime.callbacks = undefined
    dragRuntime.state = undefined
    dragRuntime.stop = undefined

    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  })

  it('拖拽结束时不会因为 flush 和最终提交重复发射相同时长', () => {
    let currentDuration = '10'
    const emitDuration = vi.fn((value: string) => {
      currentDuration = value
    })

    const control = useEffectDurationControl({
      getDuration: () => currentDuration,
      emitDuration,
      emitEase: vi.fn(),
      defaultEaseValue: '__default__',
    })

    control.handleDurationLabelPointerDown(createPointerEvent())
    dragRuntime.callbacks?.onMove(createPointerEvent({ clientX: 5 }), dragRuntime.state!)
    dragRuntime.stop?.(createPointerEvent({ clientX: 5 }))

    expect(emitDuration).toHaveBeenCalledTimes(1)
    expect(emitDuration).toHaveBeenLastCalledWith('15')
  })

  it('清理拖拽时只 flush 已排队的更新，不额外提交一次最终值', () => {
    let currentDuration = '8'
    const emitDuration = vi.fn((value: string) => {
      currentDuration = value
    })

    const control = useEffectDurationControl({
      getDuration: () => currentDuration,
      emitDuration,
      emitEase: vi.fn(),
      defaultEaseValue: '__default__',
    })

    control.handleDurationLabelPointerDown(createPointerEvent())
    dragRuntime.callbacks?.onMove(createPointerEvent({ clientX: 4 }), dragRuntime.state!)
    control.stopDurationScrub()

    expect(emitDuration).toHaveBeenCalledTimes(1)
    expect(emitDuration).toHaveBeenLastCalledWith('12')
  })
})
