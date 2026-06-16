import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useImmediatePointerDrag } from '../useImmediatePointerDrag'

import type { ImmediatePointerDragEvent } from '../useImmediatePointerDrag'

type ListenerMap = Record<string, Set<EventListenerOrEventListenerObject>>

interface PointerLikeEvent {
  altKey?: boolean
  button?: number
  buttons?: number
  clientX?: number
  clientY?: number
  currentTarget?: PointerCaptureTarget | null
  pointerId: number
  pointerType?: string
  shiftKey?: boolean
}

interface PointerCaptureTarget extends EventTarget {
  hasPointerCapture?: (pointerId: number) => boolean
  releasePointerCapture?: (pointerId: number) => void
  setPointerCapture?: (pointerId: number) => void
}

const originalAddEventListener = globalThis.addEventListener
const originalRemoveEventListener = globalThis.removeEventListener
const listenerMap: ListenerMap = {}

function createPointerEvent(overrides: PointerLikeEvent): ImmediatePointerDragEvent {
  const { pointerId, ...rest } = overrides

  return {
    altKey: false,
    button: 0,
    buttons: 1,
    clientX: 0,
    clientY: 0,
    pointerId,
    pointerType: 'mouse',
    shiftKey: false,
    ...rest,
  }
}

function invokeListener(listener: EventListenerOrEventListenerObject, payload: PointerLikeEvent) {
  if (typeof listener === 'function') {
    listener(createPointerEvent(payload) as unknown as Event)
    return
  }

  listener.handleEvent(createPointerEvent(payload) as unknown as Event)
}

function dispatchPointerEvent(eventName: string, payload: PointerLikeEvent) {
  const listeners = listenerMap[eventName]
  if (!listeners) {
    return
  }

  for (const listener of listeners) {
    invokeListener(listener, payload)
  }
}

beforeEach(() => {
  const mockedGlobal = globalThis as unknown as {
    addEventListener: typeof globalThis.addEventListener
    removeEventListener: typeof globalThis.removeEventListener
  }

  mockedGlobal.addEventListener = ((event: string, listener: EventListenerOrEventListenerObject) => {
    if (!listenerMap[event]) {
      listenerMap[event] = new Set()
    }

    listenerMap[event].add(listener)
  }) as typeof globalThis.addEventListener

  mockedGlobal.removeEventListener = ((event: string, listener: EventListenerOrEventListenerObject) => {
    listenerMap[event]?.delete(listener)
  }) as typeof globalThis.removeEventListener
})

afterEach(() => {
  for (const key of Object.keys(listenerMap)) {
    listenerMap[key].clear()
    delete listenerMap[key]
  }

  globalThis.addEventListener = originalAddEventListener
  globalThis.removeEventListener = originalRemoveEventListener
})

describe('useImmediatePointerDrag', () => {
  it('开始拖拽时会捕获当前指针并在结束时释放', () => {
    const capturedPointers = new Set<number>()
    const target: PointerCaptureTarget = Object.assign(new EventTarget(), {
      hasPointerCapture: vi.fn(pointerId => capturedPointers.has(pointerId)),
      releasePointerCapture: vi.fn((pointerId) => {
        capturedPointers.delete(pointerId)
      }),
      setPointerCapture: vi.fn((pointerId) => {
        capturedPointers.add(pointerId)
      }),
    })
    const drag = useImmediatePointerDrag({
      onEnd: vi.fn(),
      onMove: vi.fn(),
      onStart: event => ({ startX: event.clientX }),
    })

    drag.start(createPointerEvent({ currentTarget: target, pointerId: 7 }))
    dispatchPointerEvent('pointerup', { pointerId: 7 })

    expect(target.setPointerCapture).toHaveBeenCalledWith(7)
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7)
    expect(capturedPointers.has(7)).toBe(false)
  })

  it('正常收到 pointerup 时会结束拖拽', () => {
    const onEnd = vi.fn()
    const onMove = vi.fn()
    const drag = useImmediatePointerDrag({
      onEnd,
      onMove,
      onStart: event => ({ startX: event.clientX }),
    })

    drag.start(createPointerEvent({ clientX: 10, pointerId: 7 }))
    dispatchPointerEvent('pointermove', { clientX: 20, pointerId: 7 })
    dispatchPointerEvent('pointerup', { clientX: 20, pointerId: 7 })

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(drag.active).toBe(false)
  })

  it('丢失 pointerup 后再次移动且未按住按键时会自动结束拖拽', () => {
    const onEnd = vi.fn()
    const onMove = vi.fn()
    const drag = useImmediatePointerDrag({
      onEnd,
      onMove,
      onStart: event => ({ startX: event.clientX }),
    })

    drag.start(createPointerEvent({ clientX: 10, pointerId: 9 }))

    dispatchPointerEvent('pointermove', {
      buttons: 1,
      clientX: 40,
      pointerId: 9,
    })
    dispatchPointerEvent('pointermove', {
      buttons: 0,
      clientX: 42,
      pointerId: 9,
    })

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(drag.active).toBe(false)
  })

  it('允许 false 作为有效拖拽状态', () => {
    const onEnd = vi.fn()
    const onMove = vi.fn()
    const drag = useImmediatePointerDrag<boolean>({
      onEnd,
      onMove,
      onStart: () => false,
    })

    expect(drag.start(createPointerEvent({ pointerId: 10 }))).toBe(true)
    dispatchPointerEvent('pointermove', { pointerId: 10 })
    dispatchPointerEvent('pointerup', { pointerId: 10 })

    expect(onMove).toHaveBeenCalledWith(expect.anything(), false)
    expect(onEnd).toHaveBeenCalledWith(expect.anything(), false)
    expect(drag.active).toBe(false)
  })
})
