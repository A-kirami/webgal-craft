import type { Ref } from 'vue'
import type { DragPosition } from '~/types/drag-drop'

const DEFAULT_THRESHOLD = 5

type PointerDragStatus = 'dragging' | 'idle' | 'pending'

export interface DragStartContext {
  sourceElement: HTMLElement
  startPosition: DragPosition
}

export interface DragMoveContext extends DragStartContext {
  currentPosition: DragPosition
  delta: DragPosition
}

export interface DragEndContext extends DragMoveContext {
  dropTarget: Element | null
}

export interface UsePointerDragOptions {
  onDragCancel?: () => void
  onDragEnd?: (event: PointerEvent, context: DragEndContext) => void
  onDragMove?: (event: PointerEvent, context: DragMoveContext) => void
  onDragStart?: (event: PointerEvent, context: DragStartContext) => boolean | void
  threshold?: number
}

export interface UsePointerDragReturn {
  handlePointerDown: (event: PointerEvent) => void
  isDragging: Ref<boolean>
}

interface PointerDragGesture {
  currentPosition: DragPosition
  pointerId: number
  sourceElement: HTMLElement
  startPosition: DragPosition
}

function toPosition(event: PointerEvent): DragPosition {
  return { x: event.clientX, y: event.clientY }
}

function isHTMLElement(value: EventTarget | null): value is HTMLElement {
  if (!value || typeof value !== 'object') {
    return false
  }

  if (typeof HTMLElement === 'undefined') {
    return 'addEventListener' in value && 'removeEventListener' in value && 'style' in value
  }

  return value instanceof HTMLElement
}

export function usePointerDrag(options: UsePointerDragOptions = {}): UsePointerDragReturn {
  const threshold = Math.max(0, options.threshold ?? DEFAULT_THRESHOLD)
  const isDragging = shallowRef(false)

  let status: PointerDragStatus = 'idle'
  let gesture: PointerDragGesture | undefined
  let moveRafId = 0
  let pendingMoveEvent: PointerEvent | undefined
  let previousUserSelect: string | undefined
  let touchActionElement: HTMLElement | undefined
  let previousTouchAction: string | undefined

  function getStartContext(): DragStartContext | undefined {
    if (!gesture) {
      return
    }

    return {
      sourceElement: gesture.sourceElement,
      startPosition: { ...gesture.startPosition },
    }
  }

  function getMoveContext(): DragMoveContext | undefined {
    if (!gesture) {
      return
    }

    return {
      currentPosition: { ...gesture.currentPosition },
      delta: {
        x: gesture.currentPosition.x - gesture.startPosition.x,
        y: gesture.currentPosition.y - gesture.startPosition.y,
      },
      sourceElement: gesture.sourceElement,
      startPosition: { ...gesture.startPosition },
    }
  }

  function clearMoveRaf() {
    if (moveRafId !== 0) {
      cancelAnimationFrame(moveRafId)
      moveRafId = 0
    }
    pendingMoveEvent = undefined
  }

  function applyUserSelectLock() {
    previousUserSelect = document.documentElement.style.userSelect
    document.documentElement.style.userSelect = 'none'
  }

  function restoreUserSelectLock() {
    if (previousUserSelect === undefined) {
      return
    }

    document.documentElement.style.userSelect = previousUserSelect
    previousUserSelect = undefined
  }

  function applyTouchActionLock(element: HTMLElement) {
    touchActionElement = element
    previousTouchAction = element.style.touchAction
    element.style.touchAction = 'none'
  }

  function restoreTouchActionLock() {
    if (!touchActionElement) {
      return
    }

    touchActionElement.style.touchAction = previousTouchAction ?? ''
    touchActionElement = undefined
    previousTouchAction = undefined
  }

  function removeListeners() {
    gesture?.sourceElement.removeEventListener('pointermove', handlePointerMove)
    gesture?.sourceElement.removeEventListener('pointerup', handlePointerUp)
    gesture?.sourceElement.removeEventListener('pointercancel', handlePointerCancel)
    globalThis.removeEventListener('pointermove', handlePointerMove)
    globalThis.removeEventListener('pointerup', handlePointerUp)
    globalThis.removeEventListener('pointercancel', handlePointerCancel)
    globalThis.removeEventListener('keydown', handleKeyDown)
    globalThis.removeEventListener('blur', handleWindowBlur)
  }

  function releasePointerCapture() {
    if (!gesture) {
      return
    }

    const { pointerId, sourceElement } = gesture

    if (typeof sourceElement.hasPointerCapture !== 'function') {
      return
    }

    if (!sourceElement.hasPointerCapture(pointerId)) {
      return
    }

    try {
      sourceElement.releasePointerCapture(pointerId)
    } catch {
      // capture 在元素失活时可能已经被浏览器释放。
    }
  }

  function resetGestureState() {
    clearMoveRaf()
    releasePointerCapture()
    removeListeners()
    restoreTouchActionLock()
    restoreUserSelectLock()

    status = 'idle'
    gesture = undefined
    isDragging.value = false
  }

  function flushPendingMove() {
    if (!pendingMoveEvent) {
      return
    }

    const event = pendingMoveEvent
    pendingMoveEvent = undefined

    if (status !== 'dragging') {
      return
    }

    const context = getMoveContext()
    if (!context) {
      return
    }

    options.onDragMove?.(event, context)
  }

  function scheduleMoveCallback(event: PointerEvent) {
    pendingMoveEvent = event

    if (moveRafId !== 0) {
      return
    }

    moveRafId = requestAnimationFrame(() => {
      moveRafId = 0
      flushPendingMove()
    })
  }

  function tryStartDragging(event: PointerEvent): boolean {
    const context = getStartContext()
    if (!context) {
      resetGestureState()
      return false
    }

    const shouldContinue = options.onDragStart?.(event, context)
    if (shouldContinue === false) {
      resetGestureState()
      return false
    }

    status = 'dragging'
    isDragging.value = true
    applyUserSelectLock()
    return true
  }

  function handlePointerMove(event: PointerEvent) {
    const activeGesture = gesture
    if (event.pointerId !== activeGesture?.pointerId) {
      return
    }

    activeGesture.currentPosition = toPosition(event)

    if (status === 'pending') {
      const distanceX = activeGesture.currentPosition.x - activeGesture.startPosition.x
      const distanceY = activeGesture.currentPosition.y - activeGesture.startPosition.y
      const distance = Math.hypot(distanceX, distanceY)

      if (distance >= threshold && !tryStartDragging(event)) {
        return
      }
    }

    if (status !== 'dragging') {
      return
    }

    event.preventDefault()
    scheduleMoveCallback(event)
  }

  function handlePointerUp(event: PointerEvent) {
    const activeGesture = gesture
    if (event.pointerId !== activeGesture?.pointerId) {
      return
    }

    activeGesture.currentPosition = toPosition(event)
    flushPendingMove()

    if (status === 'dragging') {
      const context = getMoveContext()
      if (context) {
        options.onDragEnd?.(event, {
          ...context,
          dropTarget: document.elementFromPoint(activeGesture.currentPosition.x, activeGesture.currentPosition.y),
        })
      }
    }

    resetGestureState()
  }

  function cancelDrag() {
    if (status === 'dragging') {
      options.onDragCancel?.()
    }
    resetGestureState()
  }

  function handlePointerCancel(event: PointerEvent) {
    if (event.pointerId !== gesture?.pointerId) {
      return
    }

    cancelDrag()
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || status === 'idle') {
      return
    }

    event.preventDefault()
    cancelDrag()
  }

  function handleWindowBlur() {
    if (status === 'idle') {
      return
    }

    cancelDrag()
  }

  function addListeners() {
    gesture?.sourceElement.addEventListener('pointermove', handlePointerMove)
    gesture?.sourceElement.addEventListener('pointerup', handlePointerUp)
    gesture?.sourceElement.addEventListener('pointercancel', handlePointerCancel)
    globalThis.addEventListener('pointermove', handlePointerMove)
    globalThis.addEventListener('pointerup', handlePointerUp)
    globalThis.addEventListener('pointercancel', handlePointerCancel)
    globalThis.addEventListener('keydown', handleKeyDown)
    globalThis.addEventListener('blur', handleWindowBlur)
  }

  function handlePointerDown(event: PointerEvent) {
    if (status !== 'idle' || event.isPrimary === false || event.button !== 0) {
      return
    }

    const { currentTarget } = event
    if (!isHTMLElement(currentTarget)) {
      return
    }

    const startPosition = toPosition(event)
    gesture = {
      currentPosition: startPosition,
      pointerId: event.pointerId,
      sourceElement: currentTarget,
      startPosition,
    }
    status = 'pending'
    applyTouchActionLock(currentTarget)

    if (typeof currentTarget.setPointerCapture === 'function') {
      try {
        currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // capture 是增强能力，失败时仍保留同元素事件监听。
      }
    }

    addListeners()
  }

  tryOnUnmounted(() => {
    cancelDrag()
  })

  return {
    handlePointerDown,
    isDragging,
  }
}
