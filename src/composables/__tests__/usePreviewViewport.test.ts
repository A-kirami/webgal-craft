import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { usePreviewViewport } from '../usePreviewViewport'

type ListenerMap = Record<string, Set<EventListenerOrEventListenerObject>>

interface PointerLikeEvent {
  button?: number
  buttons?: number
  clientX?: number
  clientY?: number
  currentTarget?: PointerCaptureTarget | null
  pointerId: number
}

interface PointerCaptureTarget {
  hasPointerCapture?: (pointerId: number) => boolean
  releasePointerCapture?: (pointerId: number) => void
  setPointerCapture?: (pointerId: number) => void
}

const originalAddEventListener = globalThis.addEventListener
const originalRemoveEventListener = globalThis.removeEventListener
const listenerMap: ListenerMap = {}

function createRect(width: number, height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }
}

function createViewportElement(width: number, height: number): HTMLElement {
  return {
    getBoundingClientRect: () => createRect(width, height),
  } as HTMLElement
}

function createResizableViewportElement(width: number, height: number): {
  element: HTMLElement
  resize: (nextSize: { height: number, width: number }) => void
} {
  let currentWidth = width
  let currentHeight = height

  return {
    element: {
      getBoundingClientRect: () => createRect(currentWidth, currentHeight),
    } as HTMLElement,
    resize(nextSize) {
      currentWidth = nextSize.width
      currentHeight = nextSize.height
    },
  }
}

function createWheelEvent(
  overrides: {
    clientX: number
    clientY: number
    currentTarget: HTMLElement
    ctrlKey?: boolean
    deltaY: number
    metaKey?: boolean
  },
): WheelEvent {
  return {
    ctrlKey: false,
    metaKey: false,
    ...overrides,
    preventDefault: vi.fn(),
  } as unknown as WheelEvent
}

function createKeyboardEvent(code: string): KeyboardEvent {
  return {
    code,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent
}

function createPointerEvent(overrides: PointerLikeEvent): PointerEvent {
  const { pointerId, ...rest } = overrides

  return {
    altKey: false,
    button: 0,
    buttons: 1,
    clientX: 0,
    clientY: 0,
    pointerId,
    pointerType: 'mouse',
    preventDefault: vi.fn(),
    shiftKey: false,
    ...rest,
  } as unknown as PointerEvent
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

function dispatchKeyboardEvent(eventName: string, event: KeyboardEvent) {
  const listeners = listenerMap[eventName]
  if (!listeners) {
    return
  }

  for (const listener of listeners) {
    if (typeof listener === 'function') {
      listener(event)
      continue
    }

    listener.handleEvent(event)
  }
}

describe('usePreviewViewport', () => {
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

  it('fitToView 会按容器尺寸缩放并居中画布', () => {
    const scope = effectScope()
    const viewportElement = createViewportElement(800, 600)
    const viewport = scope.run(() => usePreviewViewport({
      getCanvasSize: () => ({ height: 900, width: 1600 }),
      getViewportElement: () => viewportElement,
    }))

    viewport?.fitToView()

    expect(viewport?.zoom.value).toBeCloseTo(0.5)
    expect(viewport?.zoomRatio.value).toBe(1)
    expect(viewport?.viewportTransform.value).toBe('translate(0px, 75px) scale(0.5)')
    expect(viewport?.canvasPlacement.value).toEqual({
      left: 0,
      scale: 0.5,
      top: 75,
    })

    scope.stop()
  })

  it('缩放比例以适应视图为 100% 基准', () => {
    const scope = effectScope()
    const viewportElement = createViewportElement(800, 600)
    const viewport = scope.run(() => usePreviewViewport({
      getCanvasSize: () => ({ height: 900, width: 1600 }),
      getViewportElement: () => viewportElement,
    }))

    viewport?.fitToView()
    viewport?.zoomIn()

    expect(viewport?.zoom.value).toBeCloseTo(0.55)
    expect(viewport?.zoomRatio.value).toBeCloseTo(1.1)

    viewport?.fitToView()

    expect(viewport?.zoom.value).toBeCloseTo(0.5)
    expect(viewport?.zoomRatio.value).toBe(1)

    scope.stop()
  })

  it('容器尺寸变化时会保留当前缩放比例', () => {
    const scope = effectScope()
    const { element: viewportElement, resize } = createResizableViewportElement(800, 600)
    const viewport = scope.run(() => usePreviewViewport({
      getCanvasSize: () => ({ height: 900, width: 1600 }),
      getViewportElement: () => viewportElement,
    }))

    viewport?.fitToView()
    viewport?.zoomIn()
    resize({ height: 900, width: 1200 })
    viewport?.syncFitToViewport()

    expect(viewport?.zoom.value).toBeCloseTo(0.825)
    expect(viewport?.zoomRatio.value).toBeCloseTo(1.1)
    expect(viewport?.viewportTransform.value).toBe('translate(-60px, 78.75px) scale(0.825)')

    scope.stop()
  })

  it('普通滚轮不会缩放画布', () => {
    const scope = effectScope()
    const viewportElement = createViewportElement(800, 600)
    const viewport = scope.run(() => usePreviewViewport({
      getCanvasSize: () => ({ height: 720, width: 1280 }),
      getViewportElement: () => viewportElement,
    }))
    const wheelEvent = createWheelEvent({
      clientX: 100,
      clientY: 50,
      currentTarget: viewportElement,
      deltaY: -1,
    })

    viewport?.handleWheel(wheelEvent)

    expect(viewport?.zoom.value).toBe(1)
    expect(viewport?.viewportTransform.value).toBe('translate(0px, 0px) scale(1)')
    expect(wheelEvent.preventDefault).not.toHaveBeenCalled()

    scope.stop()
  })

  it('Cmd 或 Ctrl 加滚轮缩放会保持光标下的画布坐标不变', () => {
    const scope = effectScope()
    const viewportElement = createViewportElement(800, 600)
    const viewport = scope.run(() => usePreviewViewport({
      getCanvasSize: () => ({ height: 720, width: 1280 }),
      getViewportElement: () => viewportElement,
    }))

    viewport?.handleWheel(createWheelEvent({
      clientX: 100,
      clientY: 50,
      currentTarget: viewportElement,
      deltaY: -1,
      metaKey: true,
    }))

    expect(viewport?.zoom.value).toBeCloseTo(1.1)
    expect(viewport?.viewportTransform.value).toBe('translate(-10px, -5px) scale(1.1)')

    scope.stop()
  })

  it('按画布坐标处理 iframe 滚轮转发时会保持该画布坐标的视口位置不变', () => {
    const scope = effectScope()
    const viewportElement = createViewportElement(800, 600)
    const viewport = scope.run(() => usePreviewViewport({
      getCanvasSize: () => ({ height: 720, width: 1280 }),
      getViewportElement: () => viewportElement,
    }))

    viewport?.zoomByWheelAtCanvasPoint(-1, { x: 120, y: 64 })

    expect(viewport?.zoom.value).toBeCloseTo(1.1)
    expect(viewport?.viewportTransform.value).toBe('translate(-12px, -6.4px) scale(1.1)')

    scope.stop()
  })

  it('按住空格拖动时会平移画布', () => {
    const scope = effectScope()
    const viewportElement = createViewportElement(800, 600)
    const viewport = scope.run(() => usePreviewViewport({
      getCanvasSize: () => ({ height: 720, width: 1280 }),
      getViewportElement: () => viewportElement,
    }))

    dispatchKeyboardEvent('keydown', createKeyboardEvent('Space'))
    viewport?.handlePointerDown(createPointerEvent({
      clientX: 100,
      clientY: 120,
      currentTarget: viewportElement,
      pointerId: 7,
    }))
    dispatchPointerEvent('pointermove', {
      clientX: 125,
      clientY: 150,
      pointerId: 7,
    })
    dispatchPointerEvent('pointerup', {
      clientX: 125,
      clientY: 150,
      pointerId: 7,
    })

    expect(viewport?.viewportTransform.value).toBe('translate(25px, 30px) scale(1)')
    expect(viewport?.isPanning.value).toBe(false)

    scope.stop()
  })

  it('按 iframe 画布坐标转发中键指针事件时会平移画布', () => {
    const scope = effectScope()
    const viewportElement = createViewportElement(800, 600)
    const viewport = scope.run(() => usePreviewViewport({
      getCanvasSize: () => ({ height: 900, width: 1600 }),
      getViewportElement: () => viewportElement,
    }))

    viewport?.fitToView()
    viewport?.handleForwardedPointerEvent({
      button: 1,
      buttons: 4,
      clientX: 100,
      clientY: 120,
      eventType: 'pointerdown',
      pointerId: 7,
    })
    viewport?.handleForwardedPointerEvent({
      button: -1,
      buttons: 4,
      clientX: 140,
      clientY: 180,
      eventType: 'pointermove',
      pointerId: 7,
    })
    viewport?.handleForwardedPointerEvent({
      button: 1,
      buttons: 0,
      clientX: 140,
      clientY: 180,
      eventType: 'pointerup',
      pointerId: 7,
    })

    expect(viewport?.viewportTransform.value).toBe('translate(20px, 105px) scale(0.5)')
    expect(viewport?.isPanning.value).toBe(false)

    scope.stop()
  })
})
