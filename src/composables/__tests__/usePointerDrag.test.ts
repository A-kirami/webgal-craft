/* eslint-disable unicorn/no-null -- 测试需要模拟 DOM PointerEvent 的 null target 语义 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePointerDrag } from '../usePointerDrag'

type ListenerMap = Record<string, Set<EventListenerOrEventListenerObject>>

interface PointerLikeEvent {
  button?: number
  clientX?: number
  clientY?: number
  currentTarget?: EventTarget | null
  isPrimary?: boolean
  pointerId: number
  pointerType?: string
  preventDefault?: () => void
}

const originalAddEventListener = globalThis.addEventListener
const originalRemoveEventListener = globalThis.removeEventListener
const globalListenerMap: ListenerMap = {}

function createPointerEvent(overrides: PointerLikeEvent): PointerEvent {
  const { pointerId, ...rest } = overrides

  return {
    button: 0,
    clientX: 0,
    clientY: 0,
    currentTarget: null,
    isPrimary: true,
    pointerId,
    pointerType: 'mouse',
    preventDefault: vi.fn(),
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

function createPointerElement() {
  const elementListenerMap: ListenerMap = {}
  const capturedPointers = new Set<number>()
  const element = {
    addEventListener(event: string, listener: EventListenerOrEventListenerObject) {
      if (!elementListenerMap[event]) {
        elementListenerMap[event] = new Set()
      }
      elementListenerMap[event].add(listener)
    },
    dispatch(eventName: string, payload: PointerLikeEvent) {
      const listeners = elementListenerMap[eventName]
      if (!listeners) {
        return
      }
      for (const listener of listeners) {
        invokeListener(listener, payload)
      }
    },
    hasPointerCapture(pointerId: number) {
      return capturedPointers.has(pointerId)
    },
    releasePointerCapture(pointerId: number) {
      capturedPointers.delete(pointerId)
    },
    removeEventListener(event: string, listener: EventListenerOrEventListenerObject) {
      elementListenerMap[event]?.delete(listener)
    },
    setPointerCapture(pointerId: number) {
      capturedPointers.add(pointerId)
    },
    style: {
      touchAction: '',
    },
  }

  return element as unknown as HTMLElement & {
    dispatch: (eventName: string, payload: PointerLikeEvent) => void
  }
}

function setupDragDocument(dropTarget: Element | null = null) {
  const documentElement = {
    style: {
      userSelect: '',
    },
  }
  const elementFromPoint = vi.fn(() => dropTarget)

  vi.stubGlobal('document', {
    documentElement,
    elementFromPoint,
  })

  return { documentElement, elementFromPoint }
}

function setupAnimationFrame() {
  let nextFrameId = 1
  const callbacks = new Map<number, FrameRequestCallback>()

  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const frameId = nextFrameId
    nextFrameId++
    callbacks.set(frameId, callback)
    return frameId
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((frameId: number) => {
    callbacks.delete(frameId)
  }))

  function flushAnimationFrame(timestamp = 16) {
    const entries = [...callbacks.entries()]
    callbacks.clear()
    for (const [, callback] of entries) {
      callback(timestamp)
    }
  }

  return { flushAnimationFrame }
}

function setupGlobalListeners() {
  const mockedGlobal = globalThis as unknown as {
    addEventListener: typeof globalThis.addEventListener
    removeEventListener: typeof globalThis.removeEventListener
  }

  mockedGlobal.addEventListener = ((event: string, listener: EventListenerOrEventListenerObject) => {
    if (!globalListenerMap[event]) {
      globalListenerMap[event] = new Set()
    }

    globalListenerMap[event].add(listener)
  }) as typeof globalThis.addEventListener

  mockedGlobal.removeEventListener = ((event: string, listener: EventListenerOrEventListenerObject) => {
    globalListenerMap[event]?.delete(listener)
  }) as typeof globalThis.removeEventListener
}

beforeEach(() => {
  setupGlobalListeners()
})

afterEach(() => {
  for (const key of Object.keys(globalListenerMap)) {
    globalListenerMap[key].clear()
    delete globalListenerMap[key]
  }
  globalThis.addEventListener = originalAddEventListener
  globalThis.removeEventListener = originalRemoveEventListener
  vi.unstubAllGlobals()
})

describe('usePointerDrag', () => {
  it('移动未超过阈值时不会进入新拖拽会话', () => {
    setupDragDocument()
    const { flushAnimationFrame } = setupAnimationFrame()
    const sourceElement = createPointerElement()
    const onDragStart = vi.fn()
    const onDragMove = vi.fn()
    const drag = usePointerDrag({
      onDragMove,
      onDragStart,
      threshold: 8,
    })

    drag.handlePointerDown(createPointerEvent({
      clientX: 10,
      clientY: 10,
      currentTarget: sourceElement,
      pointerId: 11,
    }))
    sourceElement.dispatch('pointermove', {
      clientX: 13,
      clientY: 14,
      pointerId: 11,
    })
    flushAnimationFrame()

    expect(onDragStart).not.toHaveBeenCalled()
    expect(onDragMove).not.toHaveBeenCalled()
    expect(drag.isDragging.value).toBe(false)

    sourceElement.dispatch('pointercancel', {
      clientX: 13,
      clientY: 14,
      pointerId: 11,
    })
  })

  it('超过阈值后会节流移动并在结束时提供命中目标', () => {
    const dropTarget = {} as Element
    const { elementFromPoint } = setupDragDocument(dropTarget)
    const { flushAnimationFrame } = setupAnimationFrame()
    const sourceElement = createPointerElement()
    const onDragStart = vi.fn()
    const onDragMove = vi.fn()
    const onDragEnd = vi.fn()
    const drag = usePointerDrag({
      onDragEnd,
      onDragMove,
      onDragStart,
      threshold: 4,
    })

    drag.handlePointerDown(createPointerEvent({
      clientX: 10,
      clientY: 10,
      currentTarget: sourceElement,
      pointerId: 12,
    }))
    sourceElement.dispatch('pointermove', {
      clientX: 18,
      clientY: 10,
      pointerId: 12,
    })

    expect(onDragStart).toHaveBeenCalledTimes(1)
    expect(onDragMove).not.toHaveBeenCalled()

    flushAnimationFrame()
    sourceElement.dispatch('pointerup', {
      clientX: 20,
      clientY: 11,
      pointerId: 12,
    })

    expect(onDragMove).toHaveBeenCalledTimes(1)
    expect(onDragEnd).toHaveBeenCalledWith(
      expect.objectContaining({ pointerId: 12 }),
      expect.objectContaining({
        currentPosition: { x: 20, y: 11 },
        dropTarget,
      }),
    )
    expect(elementFromPoint).toHaveBeenCalledWith(20, 11)
    expect(drag.isDragging.value).toBe(false)
  })
})
