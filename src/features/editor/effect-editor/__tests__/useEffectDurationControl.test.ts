import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useEffectDurationControl } from '~/features/editor/effect-editor/useEffectDurationControl'

import type { ImmediatePointerDragEvent } from '~/composables/useImmediatePointerDrag'

const { dragRuntime } = vi.hoisted(() => ({
  dragRuntime: {
    callbacks: undefined as undefined | {
      onEnd: (event: ImmediatePointerDragEvent | undefined, state: { lastValue: number, startValue: number, startX: number }) => void
      onMove: (event: ImmediatePointerDragEvent, state: { lastValue: number, startValue: number, startX: number }) => void
      onStart: (event: ImmediatePointerDragEvent) => { lastValue: number, startValue: number, startX: number } | undefined
    },
    state: undefined as undefined | { lastValue: number, startValue: number, startX: number },
    stop: undefined as undefined | ((event?: ImmediatePointerDragEvent) => void),
  },
}))

vi.mock('~/composables/useImmediatePointerDrag', () => ({
  useImmediatePointerDrag<S>(callbacks: {
    onEnd: (event: ImmediatePointerDragEvent | undefined, state: S) => void
    onMove: (event: ImmediatePointerDragEvent, state: S) => void
    onStart: (event: ImmediatePointerDragEvent) => S | undefined
  }) {
    dragRuntime.callbacks = callbacks as typeof dragRuntime.callbacks
    dragRuntime.stop = (event?: ImmediatePointerDragEvent) => {
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
      start(event: ImmediatePointerDragEvent) {
        dragRuntime.stop?.()
        dragRuntime.state = callbacks.onStart(event) as typeof dragRuntime.state
        return dragRuntime.state !== undefined
      },
      stop(event?: ImmediatePointerDragEvent) {
        dragRuntime.stop?.(event)
      },
    }
  },
}))

function createPointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    altKey: false,
    button: 0,
    buttons: 1,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    pointerType: 'mouse',
    preventDefault: vi.fn(),
    shiftKey: false,
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

  it('重复开始拖拽时先提交上一次拖拽的最终值', () => {
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

    control.handleDurationLabelPointerDown(createPointerEvent({ clientX: 0, pointerId: 1 }))
    dragRuntime.callbacks?.onMove(createPointerEvent({ clientX: 5, pointerId: 1 }), dragRuntime.state!)
    control.handleDurationLabelPointerDown(createPointerEvent({ clientX: 20, pointerId: 2 }))

    expect(emitDuration).toHaveBeenCalledTimes(1)
    expect(emitDuration).toHaveBeenLastCalledWith('15')
  })
})
