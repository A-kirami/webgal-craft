/* eslint-disable unicorn/no-null -- 测试需要模拟 DOM PointerEvent 的 null target 语义 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDragSession } from '../useDragSession'
import { useDragSort } from '../useDragSort'

import type { Ref, StyleValue } from 'vue'
import type { EditorTabDragPayload } from '~/types/drag-drop'

type ListenerMap = Record<string, Set<EventListenerOrEventListenerObject>>

interface PointerLikeEvent {
  button?: number
  buttons?: number
  clientX?: number
  clientY?: number
  currentTarget?: EventTarget | null
  isPrimary?: boolean
  pointerId: number
  target?: EventTarget | null
  preventDefault?: () => void
}

interface TestDragElement extends HTMLElement {
  dispatch: (eventName: string, payload: PointerLikeEvent) => void
  listeners: ListenerMap
}

interface TestTargetElement extends EventTarget {
  closest: (selector: string) => Element | null
}

const tabPayload: EditorTabDragPayload = {
  path: '/game/a.txt',
  source: 'editor-tabs',
  type: 'editor-tab',
}
const originalAddEventListener = globalThis.addEventListener
const originalRemoveEventListener = globalThis.removeEventListener
const globalListenerMap: ListenerMap = {}

function createPointerEvent(overrides: PointerLikeEvent): PointerEvent {
  const { pointerId, ...rest } = overrides

  return {
    button: 0,
    buttons: 1,
    clientX: 0,
    clientY: 0,
    currentTarget: null,
    isPrimary: true,
    pointerId,
    preventDefault: vi.fn(),
    target: null,
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

function createRect(left: number, width: number, top: number = 0, height: number = 32): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  }
}

function createIgnoredTarget(): TestTargetElement {
  const target = {
    closest(selector: string) {
      return selector === '[data-drag-ignore]' ? target as unknown as Element : null
    },
  }

  return target as TestTargetElement
}

function createDragElement(index: number, rect: DOMRect): TestDragElement {
  const listeners: ListenerMap = {}
  const capturedPointers = new Set<number>()
  const dataset: Record<string, string> = {
    dragIndex: String(index),
  }
  const element = {
    dataset,
    listeners,
    style: {
      touchAction: '',
    },
    addEventListener(event: string, listener: EventListenerOrEventListenerObject) {
      if (!listeners[event]) {
        listeners[event] = new Set()
      }
      listeners[event].add(listener)
    },
    closest(selector: string) {
      return element.dataset.tabHandle === 'true' && selector === '[data-tab-handle]'
        ? element
        : null
    },
    contains(target: EventTarget | null) {
      return target !== null
    },
    dispatch(eventName: string, payload: PointerLikeEvent) {
      const eventListeners = listeners[eventName]
      if (!eventListeners) {
        return
      }

      for (const listener of eventListeners) {
        invokeListener(listener, payload)
      }
    },
    getBoundingClientRect: () => rect,
    hasPointerCapture(pointerId: number) {
      return capturedPointers.has(pointerId)
    },
    releasePointerCapture(pointerId: number) {
      capturedPointers.delete(pointerId)
    },
    removeEventListener(event: string, listener: EventListenerOrEventListenerObject) {
      listeners[event]?.delete(listener)
    },
    setPointerCapture(pointerId: number) {
      capturedPointers.add(pointerId)
    },
  }

  return element as unknown as TestDragElement
}

function createContainer(elements: HTMLElement[], rect: DOMRect = createRect(0, 300)): HTMLElement {
  return {
    getBoundingClientRect: () => rect,
    querySelectorAll: vi.fn(() => elements),
    scrollBy: vi.fn(),
    scrollLeft: 0,
    scrollTop: 0,
  } as unknown as HTMLElement
}

function createScrollingContainer(elements: HTMLElement[], rect: DOMRect = createRect(0, 300)): HTMLElement {
  const container = createContainer(elements, rect)

  const scrollBy = vi.fn((optionsOrX?: ScrollToOptions | number, y?: number) => {
    const left = typeof optionsOrX === 'number' ? optionsOrX : optionsOrX?.left ?? 0
    const top = typeof optionsOrX === 'number' ? y ?? 0 : optionsOrX?.top ?? 0

    container.scrollLeft += left
    container.scrollTop += top
  })
  container.scrollBy = scrollBy as HTMLElement['scrollBy']

  return container
}

function setupDragDocument() {
  vi.stubGlobal('document', {
    documentElement: {
      style: {
        userSelect: '',
      },
    },
    elementFromPoint: vi.fn(() => null),
  })
}

function setupAnimationFrame() {
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    callback(16)
    return 0
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
}

function setupControlledAnimationFrame() {
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

  function flushAnimationFrame(timestamp: number) {
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

function styleRecord(style: StyleValue | undefined): Record<string, string> {
  return (style ?? {}) as Record<string, string>
}

function createSortFixture(itemsRef: Ref<string[]> = shallowRef(['a', 'b', 'c'])) {
  const elements = [
    createDragElement(0, createRect(0, 100)),
    createDragElement(1, createRect(100, 100)),
    createDragElement(2, createRect(200, 100)),
  ]
  const onSort = vi.fn()
  const sort = useDragSort<string>({
    autoScroll: false,
    direction: 'horizontal',
    getKey: item => item,
    getPayload: () => tabPayload,
    items: itemsRef,
    onSort,
  })
  sort.containerRef.value = createContainer(elements)

  return {
    elements,
    itemsRef,
    onSort,
    sort,
  }
}

function startDrag(element: TestDragElement, pointerId: number, moveX: number, moveY: number = 0) {
  element.dispatch('pointermove', {
    clientX: moveX,
    clientY: moveY,
    pointerId,
    target: element,
  })
}

function moveDrag(pointerId: number, moveX: number, moveY: number = 0) {
  for (const listener of globalListenerMap.pointermove ?? []) {
    invokeListener(listener, {
      clientX: moveX,
      clientY: moveY,
      pointerId,
      target: null,
    })
  }
}

afterEach(() => {
  vi.useRealTimers()
  useDragSession().cancel()
  for (const key of Object.keys(globalListenerMap)) {
    globalListenerMap[key].clear()
    delete globalListenerMap[key]
  }
  globalThis.addEventListener = originalAddEventListener
  globalThis.removeEventListener = originalRemoveEventListener
  vi.unstubAllGlobals()
})

describe('useDragSort', () => {
  it('释放后先进入 settling，动画结束后才按移除源项后的 targetIndex 提交排序', () => {
    vi.useFakeTimers()
    setupDragDocument()
    setupAnimationFrame()
    setupGlobalListeners()
    const session = useDragSession()
    const { elements, onSort, sort } = createSortFixture()

    sort.getItemProps(0).onPointerdown(createPointerEvent({
      clientX: 10,
      currentTarget: elements[0],
      pointerId: 1,
      target: elements[0],
    }))
    startDrag(elements[0], 1, 260)

    expect(sort.phase.value).toBe('dragging')
    expect(sort.targetIndex.value).toBe(2)
    expect(onSort).not.toHaveBeenCalled()
    expect(sort.getItemStyle(1)).toMatchObject({
      transform: 'translate3d(-100px, 0, 0)',
    })
    expect(sort.overlayState.value).toMatchObject({
      item: 'a',
      key: 'a',
      phase: 'dragging',
    })
    expect(session.state.value).toMatchObject({
      isActive: true,
      mode: 'sort',
      payload: tabPayload,
    })

    elements[0].dispatch('pointerup', {
      clientX: 260,
      pointerId: 1,
      target: elements[0],
    })

    expect(sort.phase.value).toBe('settling')
    expect(onSort).not.toHaveBeenCalled()

    vi.runOnlyPendingTimers()

    expect(onSort).toHaveBeenCalledWith(0, 2)
    expect(sort.phase.value).toBe('idle')
    expect(sort.dragIndex.value).toBe(-1)
    expect(sort.targetIndex.value).toBe(-1)
    expect(session.state.value.isActive).toBe(false)
  })

  it('settling 未完成时不会开始新的排序会话', () => {
    vi.useFakeTimers()
    setupDragDocument()
    setupAnimationFrame()
    setupGlobalListeners()
    const { elements, onSort, sort } = createSortFixture()

    sort.getItemProps(0).onPointerdown(createPointerEvent({
      clientX: 10,
      currentTarget: elements[0],
      pointerId: 11,
      target: elements[0],
    }))
    startDrag(elements[0], 11, 260)
    elements[0].dispatch('pointerup', {
      clientX: 260,
      pointerId: 11,
      target: elements[0],
    })

    sort.getItemProps(1).onPointerdown(createPointerEvent({
      clientX: 110,
      currentTarget: elements[1],
      pointerId: 12,
      target: elements[1],
    }))
    startDrag(elements[1], 12, 10)

    expect(sort.phase.value).toBe('settling')
    expect(sort.dragIndex.value).toBe(0)
    expect(sort.targetIndex.value).toBe(2)

    vi.runOnlyPendingTimers()

    expect(onSort).toHaveBeenCalledOnce()
    expect(onSort).toHaveBeenCalledWith(0, 2)
    expect(sort.phase.value).toBe('idle')
  })

  it('向左拖拽时也使用移除源项后的 targetIndex，避免 hoverIndex 直传导致 off-by-one', () => {
    vi.useFakeTimers()
    setupDragDocument()
    setupAnimationFrame()
    setupGlobalListeners()
    const { elements, onSort, sort } = createSortFixture()

    sort.getItemProps(2).onPointerdown(createPointerEvent({
      clientX: 250,
      currentTarget: elements[2],
      pointerId: 2,
      target: elements[2],
    }))
    startDrag(elements[2], 2, 10)
    elements[2].dispatch('pointerup', {
      clientX: 10,
      pointerId: 2,
      target: elements[2],
    })

    vi.runOnlyPendingTimers()

    expect(onSort).toHaveBeenCalledWith(2, 0)
  })

  it('使用克隆标签前缘越过项目中点来更新 targetIndex，而不是使用光标位置或克隆中心', () => {
    setupDragDocument()
    setupAnimationFrame()
    setupGlobalListeners()
    const { elements, sort } = createSortFixture()

    sort.getItemProps(0).onPointerdown(createPointerEvent({
      clientX: 10,
      currentTarget: elements[0],
      pointerId: 8,
      target: elements[0],
    }))
    startDrag(elements[0], 8, 60)

    expect(styleRecord(sort.overlayState.value?.overlayStyle)).toMatchObject({
      transform: 'translate3d(50px, 0px, 0)',
    })
    expect(sort.targetIndex.value).toBe(1)
    expect(sort.getItemStyle(1)).toMatchObject({
      transform: 'translate3d(-100px, 0, 0)',
    })
  })

  it('项目回到原位时仍保留 transform transition', () => {
    setupDragDocument()
    setupAnimationFrame()
    setupGlobalListeners()
    const { elements, sort } = createSortFixture()

    sort.getItemProps(0).onPointerdown(createPointerEvent({
      clientX: 10,
      currentTarget: elements[0],
      pointerId: 9,
      target: elements[0],
    }))
    startDrag(elements[0], 9, 260)
    expect(sort.getItemStyle(1)).toMatchObject({
      transform: 'translate3d(-100px, 0, 0)',
      transition: expect.any(String),
    })

    moveDrag(9, 10)

    expect(sort.getItemStyle(1)).toMatchObject({
      transform: 'translate3d(0px, 0, 0)',
      transition: expect.any(String),
    })
  })

  it('命中 ignoreSelector 的 pointerdown 不会进入 pending drag', () => {
    setupDragDocument()
    setupAnimationFrame()
    setupGlobalListeners()
    const { elements, onSort } = createSortFixture()
    const sort = useDragSort<string>({
      autoScroll: false,
      direction: 'horizontal',
      getKey: item => item,
      getPayload: () => tabPayload,
      ignoreSelector: '[data-drag-ignore]',
      items: shallowRef(['a', 'b', 'c']),
      onSort,
    })
    sort.containerRef.value = createContainer(elements)
    const ignoredTarget = createIgnoredTarget()

    sort.getItemProps(0).onPointerdown(createPointerEvent({
      clientX: 10,
      currentTarget: elements[0],
      pointerId: 3,
      target: ignoredTarget,
    }))

    expect(elements[0].listeners.pointermove).toBeUndefined()
    expect(globalListenerMap.pointermove).toBeUndefined()
    expect(sort.phase.value).toBe('idle')
    expect(onSort).not.toHaveBeenCalled()
  })

  it('settling 期间投影 key 序列变化时取消提交，避免插入到错误语义位置', () => {
    vi.useFakeTimers()
    setupDragDocument()
    setupAnimationFrame()
    setupGlobalListeners()
    const itemsRef = shallowRef(['a', 'b', 'c'])
    const { elements, onSort, sort } = createSortFixture(itemsRef)

    sort.getItemProps(0).onPointerdown(createPointerEvent({
      clientX: 10,
      currentTarget: elements[0],
      pointerId: 4,
      target: elements[0],
    }))
    startDrag(elements[0], 4, 260)
    elements[0].dispatch('pointerup', {
      clientX: 260,
      pointerId: 4,
      target: elements[0],
    })
    itemsRef.value = ['a', 'x', 'b', 'c']

    vi.runOnlyPendingTimers()

    expect(onSort).not.toHaveBeenCalled()
    expect(sort.phase.value).toBe('idle')
  })

  it('拖拽源项在 settling 前消失时取消提交', () => {
    vi.useFakeTimers()
    setupDragDocument()
    setupAnimationFrame()
    setupGlobalListeners()
    const itemsRef = shallowRef(['a', 'b', 'c'])
    const { elements, onSort, sort } = createSortFixture(itemsRef)

    sort.getItemProps(0).onPointerdown(createPointerEvent({
      clientX: 10,
      currentTarget: elements[0],
      pointerId: 5,
      target: elements[0],
    }))
    startDrag(elements[0], 5, 260)
    elements[0].dispatch('pointerup', {
      clientX: 260,
      pointerId: 5,
      target: elements[0],
    })
    itemsRef.value = ['b', 'c']

    vi.runOnlyPendingTimers()

    expect(onSort).not.toHaveBeenCalled()
  })

  it('副轴移动不影响 targetIndex，overlay 副轴位置保持源项轨道并且主轴被 viewport clamp', () => {
    setupDragDocument()
    setupAnimationFrame()
    setupGlobalListeners()
    const elements = [
      createDragElement(0, createRect(0, 100, 8, 32)),
      createDragElement(1, createRect(100, 100, 8, 32)),
      createDragElement(2, createRect(200, 100, 8, 32)),
    ]
    const sort = useDragSort<string>({
      autoScroll: false,
      direction: 'horizontal',
      getKey: item => item,
      getPayload: () => tabPayload,
      items: shallowRef(['a', 'b', 'c']),
      onSort: vi.fn(),
    })
    sort.containerRef.value = createContainer(elements, createRect(0, 250, 0, 48))

    sort.getItemProps(0).onPointerdown(createPointerEvent({
      clientX: 10,
      clientY: 20,
      currentTarget: elements[0],
      pointerId: 6,
      target: elements[0],
    }))
    elements[0].dispatch('pointermove', {
      clientX: 320,
      clientY: 240,
      pointerId: 6,
      target: elements[0],
    })

    expect(sort.targetIndex.value).toBe(2)
    expect(styleRecord(sort.overlayState.value?.overlayStyle)).toMatchObject({
      height: '32px',
      transform: 'translate3d(150px, 8px, 0)',
      width: '100px',
    })
  })

  it('拖拽结束后的下一次合成 click 会被消费', () => {
    vi.useFakeTimers()
    setupDragDocument()
    setupAnimationFrame()
    setupGlobalListeners()
    const { elements, sort } = createSortFixture()
    const clickEvent = {
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent

    sort.getItemProps(0).onPointerdown(createPointerEvent({
      clientX: 10,
      currentTarget: elements[0],
      pointerId: 7,
      target: elements[0],
    }))
    startDrag(elements[0], 7, 260)
    elements[0].dispatch('pointerup', {
      clientX: 260,
      pointerId: 7,
      target: elements[0],
    })

    sort.getItemProps(0).onClickCapture(clickEvent)

    expect(clickEvent.preventDefault).toHaveBeenCalled()
    expect(clickEvent.stopPropagation).toHaveBeenCalled()
    expect(clickEvent.stopImmediatePropagation).toHaveBeenCalled()

    vi.runOnlyPendingTimers()
  })

  it('取消拖拽后不会消费后续正常 click', () => {
    setupDragDocument()
    setupAnimationFrame()
    setupGlobalListeners()
    const { elements, sort } = createSortFixture()
    const clickEvent = {
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent

    sort.getItemProps(0).onPointerdown(createPointerEvent({
      clientX: 10,
      currentTarget: elements[0],
      pointerId: 13,
      target: elements[0],
    }))
    startDrag(elements[0], 13, 260)
    elements[0].dispatch('pointercancel', {
      clientX: 260,
      pointerId: 13,
      target: elements[0],
    })

    sort.getItemProps(0).onClickCapture(clickEvent)

    expect(clickEvent.preventDefault).not.toHaveBeenCalled()
    expect(clickEvent.stopPropagation).not.toHaveBeenCalled()
    expect(clickEvent.stopImmediatePropagation).not.toHaveBeenCalled()
  })

  it('自动滚动标签页列表时无需新的 pointermove 也会刷新占位目标', () => {
    setupDragDocument()
    const { flushAnimationFrame } = setupControlledAnimationFrame()
    setupGlobalListeners()
    const elements = [
      createDragElement(0, createRect(0, 100)),
      createDragElement(1, createRect(100, 100)),
      createDragElement(2, createRect(200, 100)),
      createDragElement(3, createRect(300, 100)),
      createDragElement(4, createRect(400, 100)),
    ]
    const sort = useDragSort<string>({
      direction: 'horizontal',
      getKey: item => item,
      getPayload: () => tabPayload,
      items: shallowRef(['a', 'b', 'c', 'd', 'e']),
      onSort: vi.fn(),
    })
    const container = createScrollingContainer(elements)
    sort.containerRef.value = container

    sort.getItemProps(0).onPointerdown(createPointerEvent({
      clientX: 10,
      currentTarget: elements[0],
      pointerId: 10,
      target: elements[0],
    }))
    startDrag(elements[0], 10, 295)

    flushAnimationFrame(50)
    flushAnimationFrame(100)

    expect(sort.targetIndex.value).toBe(2)

    flushAnimationFrame(200)

    expect(container.scrollLeft).toBeGreaterThan(0)
    expect(sort.targetIndex.value).toBe(3)
  })
})
