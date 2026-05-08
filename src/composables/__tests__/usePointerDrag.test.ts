import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePointerDrag } from '../usePointerDrag'

type ListenerMap = Record<string, Set<EventListenerOrEventListenerObject>>

interface PointerLikeEvent {
  buttons?: number
  clientX?: number
  pointerId: number
  pointerType?: string
}

const originalAddEventListener = globalThis.addEventListener
const originalRemoveEventListener = globalThis.removeEventListener
const listenerMap: ListenerMap = {}

function createPointerEvent(overrides: PointerLikeEvent): PointerEvent {
  const { pointerId, ...rest } = overrides

  return {
    buttons: 1,
    clientX: 0,
    pointerId,
    pointerType: 'mouse',
    ...rest,
  } as PointerEvent
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

describe('usePointerDrag', () => {
  it('正常收到 pointerup 时会结束拖拽', () => {
    const onEnd = vi.fn()
    const onMove = vi.fn()
    const drag = usePointerDrag({
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
    const drag = usePointerDrag({
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
})
