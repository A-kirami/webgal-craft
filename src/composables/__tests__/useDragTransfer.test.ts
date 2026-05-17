/* eslint-disable unicorn/no-null -- 测试需要模拟 DOM PointerEvent 的 null target 语义 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDragSession } from '../useDragSession'
import { useDragSource } from '../useDragTransfer'
import { useDroppableRegistry } from '../useDroppableRegistry'

import type { Ref } from 'vue'
import type { FileSystemDragPayload } from '~/types/drag-drop'

type ListenerMap = Record<string, Set<EventListenerOrEventListenerObject>>

interface PointerLikeEvent {
  altKey?: boolean
  button?: number
  buttons?: number
  clientX?: number
  clientY?: number
  ctrlKey?: boolean
  currentTarget?: EventTarget | null
  isPrimary?: boolean
  metaKey?: boolean
  pointerId: number
  target?: EventTarget | null
  preventDefault?: () => void
}

interface TestDragElement extends HTMLElement {
  dispatch: (eventName: string, payload: PointerLikeEvent) => void
  listeners: ListenerMap
}

const originalAddEventListener = globalThis.addEventListener
const originalRemoveEventListener = globalThis.removeEventListener
const globalListenerMap: ListenerMap = {}

const filePayload: FileSystemDragPayload = {
  isDir: false,
  name: 'start.txt',
  path: '/project/game/scene/start.txt',
  source: 'file-tree',
  type: 'file-system-item',
}

function createPointerEvent(overrides: PointerLikeEvent): PointerEvent {
  const { pointerId, ...rest } = overrides

  return {
    altKey: false,
    button: 0,
    buttons: 1,
    clientX: 0,
    clientY: 0,
    ctrlKey: false,
    currentTarget: null,
    isPrimary: true,
    metaKey: false,
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

function createDragElement(): TestDragElement {
  const listeners: ListenerMap = {}
  const capturedPointers = new Set<number>()
  const element = {
    addEventListener(event: string, listener: EventListenerOrEventListenerObject) {
      if (!listeners[event]) {
        listeners[event] = new Set()
      }
      listeners[event].add(listener)
    },
    closest: vi.fn(() => null),
    contains: vi.fn(() => true),
    dispatch(eventName: string, payload: PointerLikeEvent) {
      for (const listener of listeners[eventName] ?? []) {
        invokeListener(listener, payload)
      }
    },
    hasPointerCapture(pointerId: number) {
      return capturedPointers.has(pointerId)
    },
    listeners,
    releasePointerCapture(pointerId: number) {
      capturedPointers.delete(pointerId)
    },
    removeEventListener(event: string, listener: EventListenerOrEventListenerObject) {
      listeners[event]?.delete(listener)
    },
    setPointerCapture(pointerId: number) {
      capturedPointers.add(pointerId)
    },
    style: {
      touchAction: '',
    },
  }

  return element as unknown as TestDragElement
}

function createTargetElement(): HTMLElement {
  return {
    dataset: {},
    parentElement: null,
  } as unknown as HTMLElement
}

function createScrollContainer(): HTMLElement {
  let scrollTop = 20
  let hasScrolled = false

  return {
    get scrollTop() {
      return scrollTop
    },
    set scrollTop(value: number) {
      scrollTop = value
    },
    getBoundingClientRect: () => ({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    scrollBy: vi.fn((options: ScrollToOptions) => {
      if (hasScrolled) {
        return
      }
      hasScrolled = true
      scrollTop += options.top ?? 0
    }),
    scrollLeft: 0,
  } as unknown as HTMLElement
}

function createScrollContainerRef(container: HTMLElement): Ref<HTMLElement | undefined> {
  return shallowRef(container)
}

function registerTestDropTarget(
  target: HTMLElement,
  options: {
    canDrop?: () => boolean
    onDragEnter?: () => void
    onDragLeave?: () => void
    onDrop?: (payload: FileSystemDragPayload, target: HTMLElement) => void
  } = {},
) {
  const registry = useDroppableRegistry()
  registry.registerDroppable(target, {
    accept: 'file-system-item',
    canDrop: options.canDrop,
    id: 'folder',
    onDragEnter: options.onDragEnter,
    onDragLeave: options.onDragLeave,
    onDrop: (payload, element) => options.onDrop?.(payload as FileSystemDragPayload, element),
  })
  return registry
}

function setupDragDocument(dropTarget: Element | null = null) {
  vi.stubGlobal('document', {
    documentElement: {
      style: {
        userSelect: '',
      },
    },
    elementFromPoint: vi.fn(() => dropTarget),
  })
}

function setupAnimationFrame() {
  let currentTimestamp = 0

  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    currentTimestamp += 16
    callback(currentTimestamp)
    return 0
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
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

function startDrag(
  element: TestDragElement,
  pointerId: number,
  x: number,
  y: number,
  options: Partial<PointerLikeEvent> = {},
) {
  element.dispatch('pointermove', {
    clientX: x,
    clientY: y,
    pointerId,
    target: element,
    ...options,
  })
}

function moveDrag(element: TestDragElement, payload: PointerLikeEvent) {
  element.dispatch('pointermove', payload)
}

afterEach(() => {
  useDragSession().cancel()
  for (const key of Object.keys(globalListenerMap)) {
    globalListenerMap[key].clear()
    delete globalListenerMap[key]
  }
  vi.useRealTimers()
  globalThis.addEventListener = originalAddEventListener
  globalThis.removeEventListener = originalRemoveEventListener
  vi.unstubAllGlobals()
})

describe('useDragTransfer', () => {
  it('useDragTransferSource 会在拖拽开始后写入 transfer 会话并更新目标命中', () => {
    setupGlobalListeners()
    const target = createTargetElement()
    setupDragDocument(target)
    setupAnimationFrame()
    const session = useDragSession()
    const onDrop = vi.fn()
    const onDragEnter = vi.fn()
    const sourceElement = createDragElement()
    const source = useDragSource<FileSystemDragPayload>({
      getData: () => filePayload,
      type: 'file-system-item',
    })
    const registry = registerTestDropTarget(target, {
      onDragEnter,
      onDrop,
    })

    source.sourceProps().onPointerdown(createPointerEvent({
      clientX: 10,
      clientY: 10,
      currentTarget: sourceElement,
      pointerId: 1,
      target: sourceElement,
    }))
    startDrag(sourceElement, 1, 20, 20)

    expect(session.state.value).toMatchObject({
      currentDropTarget: target,
      isActive: true,
      mode: 'transfer',
      payload: filePayload,
    })
    expect(onDragEnter).toHaveBeenCalledTimes(1)
    expect(registry.hoveredTarget.value).toBe(target)
    expect(registry.isDropAllowed.value).toBe(true)

    sourceElement.dispatch('pointerup', {
      clientX: 20,
      clientY: 20,
      pointerId: 1,
      target: sourceElement,
    })

    expect(onDrop).toHaveBeenCalledWith(filePayload, target)
  })

  it('命中不允许的目标时会保留悬停状态但不执行 drop', () => {
    setupGlobalListeners()
    const target = createTargetElement()
    setupDragDocument(target)
    setupAnimationFrame()
    const sourceElement = createDragElement()
    const onDrop = vi.fn()
    const onDragEnter = vi.fn()
    const source = useDragSource<FileSystemDragPayload>({
      getData: () => filePayload,
      type: 'file-system-item',
    })
    const registry = registerTestDropTarget(target, {
      canDrop: () => false,
      onDragEnter,
      onDrop,
    })

    source.sourceProps().onPointerdown(createPointerEvent({
      clientX: 10,
      clientY: 10,
      currentTarget: sourceElement,
      pointerId: 2,
      target: sourceElement,
    }))
    startDrag(sourceElement, 2, 20, 20)

    expect(onDragEnter).toHaveBeenCalledTimes(1)
    expect(registry.hoveredTarget.value).toBe(target)
    expect(registry.isDropAllowed.value).toBe(false)

    sourceElement.dispatch('pointerup', {
      clientX: 20,
      clientY: 20,
      pointerId: 2,
      target: sourceElement,
    })

    expect(onDrop).not.toHaveBeenCalled()
  })

  it('拖拽结束后若未收到 click 事件会自动清理点击抑制状态', () => {
    vi.useFakeTimers()
    setupGlobalListeners()
    const target = createTargetElement()
    setupDragDocument(target)
    setupAnimationFrame()
    const sourceElement = createDragElement()
    const source = useDragSource<FileSystemDragPayload>({
      getData: () => filePayload,
      type: 'file-system-item',
    })
    const sourceProps = source.sourceProps()
    registerTestDropTarget(target)

    sourceProps.onPointerdown(createPointerEvent({
      clientX: 10,
      clientY: 10,
      currentTarget: sourceElement,
      pointerId: 8,
      target: sourceElement,
    }))
    startDrag(sourceElement, 8, 20, 20)
    sourceElement.dispatch('pointerup', {
      clientX: 20,
      clientY: 20,
      pointerId: 8,
      target: sourceElement,
    })

    vi.runAllTimers()

    const clickEvent = {
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent

    sourceProps.onClickCapture(clickEvent)

    expect(clickEvent.preventDefault).not.toHaveBeenCalled()
  })

  it('按住 Ctrl 时会临时切换 transfer 会话为 copy，松开后恢复 move', () => {
    setupGlobalListeners()
    const target = createTargetElement()
    setupDragDocument(target)
    setupAnimationFrame()
    const session = useDragSession()
    const sourceElement = createDragElement()
    const source = useDragSource<FileSystemDragPayload>({
      getData: () => filePayload,
      type: 'file-system-item',
    })
    registerTestDropTarget(target)

    source.sourceProps().onPointerdown(createPointerEvent({
      clientX: 10,
      clientY: 10,
      ctrlKey: true,
      currentTarget: sourceElement,
      pointerId: 3,
      target: sourceElement,
    }))
    startDrag(sourceElement, 3, 20, 20, { ctrlKey: true })

    expect(session.state.value.transferOperation).toBe('copy')

    moveDrag(sourceElement, {
      clientX: 24,
      clientY: 24,
      ctrlKey: false,
      pointerId: 3,
      target: sourceElement,
    })

    expect(session.state.value.transferOperation).toBe('move')

    moveDrag(sourceElement, {
      clientX: 28,
      clientY: 28,
      ctrlKey: true,
      pointerId: 3,
      target: sourceElement,
    })

    expect(session.state.value.transferOperation).toBe('copy')
  })

  it('配置自动滚动容器后会在拖拽靠近边缘时滚动', () => {
    setupGlobalListeners()
    const target = createTargetElement()
    setupDragDocument(target)
    setupAnimationFrame()
    const sourceElement = createDragElement()
    const scrollContainer = createScrollContainer()
    const source = useDragSource<FileSystemDragPayload>({
      autoScroll: {
        container: createScrollContainerRef(scrollContainer),
        edgeSize: 20,
        maxSpeed: 200,
      },
      getData: () => filePayload,
      type: 'file-system-item',
    })
    registerTestDropTarget(target)

    source.sourceProps().onPointerdown(createPointerEvent({
      clientX: 10,
      clientY: 10,
      currentTarget: sourceElement,
      pointerId: 6,
      target: sourceElement,
    }))
    startDrag(sourceElement, 6, 50, 95)

    expect(scrollContainer.scrollBy).toHaveBeenCalledWith({
      behavior: 'auto',
      left: 0,
      top: expect.any(Number),
    })
    expect(scrollContainer.scrollTop).toBeGreaterThan(20)

    sourceElement.dispatch('pointerup', {
      clientX: 50,
      clientY: 95,
      pointerId: 6,
      target: sourceElement,
    })
  })

  it('拖出自动滚动容器后不会继续滚动源容器', () => {
    setupGlobalListeners()
    const target = createTargetElement()
    setupDragDocument(target)
    setupAnimationFrame()
    const sourceElement = createDragElement()
    const scrollContainer = createScrollContainer()
    const source = useDragSource<FileSystemDragPayload>({
      autoScroll: {
        container: createScrollContainerRef(scrollContainer),
        edgeSize: 20,
        maxSpeed: 200,
      },
      getData: () => filePayload,
      type: 'file-system-item',
    })
    registerTestDropTarget(target)

    source.sourceProps().onPointerdown(createPointerEvent({
      clientX: 10,
      clientY: 10,
      currentTarget: sourceElement,
      pointerId: 7,
      target: sourceElement,
    }))
    startDrag(sourceElement, 7, 50, 95)

    expect(scrollContainer.scrollBy).toHaveBeenCalled()
    const scrollByMock = scrollContainer.scrollBy as unknown as ReturnType<typeof vi.fn>
    const callCountBeforeLeaving = scrollByMock.mock.calls.length
    const scrollTopBeforeLeaving = scrollContainer.scrollTop

    moveDrag(sourceElement, {
      clientX: 150,
      clientY: 95,
      pointerId: 7,
      target: sourceElement,
    })

    expect(scrollByMock).toHaveBeenCalledTimes(callCountBeforeLeaving)
    expect(scrollContainer.scrollTop).toBe(scrollTopBeforeLeaving)

    sourceElement.dispatch('pointerup', {
      clientX: 150,
      clientY: 95,
      pointerId: 7,
      target: sourceElement,
    })
  })
})
