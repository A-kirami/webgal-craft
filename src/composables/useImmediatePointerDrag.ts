export interface ImmediatePointerDragEvent {
  altKey: boolean
  button: number
  buttons: number
  clientX: number
  clientY: number
  currentTarget?: EventTarget | null
  pointerId: number
  pointerType?: string
  shiftKey: boolean
}

export interface ImmediatePointerDragCallbacks<S> {
  onStart: (event: ImmediatePointerDragEvent) => S | undefined
  onMove: (event: ImmediatePointerDragEvent, state: S) => void
  onEnd: (event: ImmediatePointerDragEvent | undefined, state: S) => void
}

export interface UseImmediatePointerDragResult<S> {
  active: boolean
  end: (event: ImmediatePointerDragEvent) => void
  move: (event: ImmediatePointerDragEvent) => void
  state: S | undefined
  start: (event: ImmediatePointerDragEvent) => boolean
  stop: (event?: ImmediatePointerDragEvent) => void
}

interface PointerCaptureTarget {
  hasPointerCapture?: (pointerId: number) => boolean
  releasePointerCapture?: (pointerId: number) => void
  setPointerCapture?: (pointerId: number) => void
}

export function useImmediatePointerDrag<S>(
  callbacks: ImmediatePointerDragCallbacks<S>,
): UseImmediatePointerDragResult<S> {
  let state: S | undefined
  let pointerId: number | undefined
  let captureTarget: PointerCaptureTarget | undefined

  function removeListeners() {
    globalThis.removeEventListener('pointermove', handlePointerMove)
    globalThis.removeEventListener('pointerup', handlePointerEnd)
    globalThis.removeEventListener('pointercancel', handlePointerEnd)
  }

  function capturePointer(event: ImmediatePointerDragEvent) {
    const target = event.currentTarget as PointerCaptureTarget | null
    if (typeof target?.setPointerCapture !== 'function') {
      return
    }

    try {
      target.setPointerCapture(event.pointerId)
      captureTarget = target
    } catch {
      // capture 是增强能力，失败时仍保留全局事件监听。
    }
  }

  function releasePointerCapture() {
    if (captureTarget === undefined || pointerId === undefined) {
      return
    }

    const target = captureTarget
    captureTarget = undefined

    if (typeof target.hasPointerCapture === 'function' && !target.hasPointerCapture(pointerId)) {
      return
    }
    if (typeof target.releasePointerCapture !== 'function') {
      return
    }

    try {
      target.releasePointerCapture(pointerId)
    } catch {
      // capture 在元素失活时可能已经被浏览器释放。
    }
  }

  function handlePointerMove(event: ImmediatePointerDragEvent) {
    if (state === undefined || event.pointerId !== pointerId) {
      return
    }

    if (event.buttons === 0) {
      stop(event)
      return
    }

    callbacks.onMove(event, state)
  }

  function handlePointerEnd(event: ImmediatePointerDragEvent) {
    if (event.pointerId !== pointerId) {
      return
    }
    stop(event)
  }

  function stop(event?: ImmediatePointerDragEvent) {
    if (state === undefined) {
      return
    }

    const current = state
    state = undefined
    releasePointerCapture()
    pointerId = undefined
    removeListeners()
    callbacks.onEnd(event, current)
  }

  function start(event: ImmediatePointerDragEvent): boolean {
    const nextState = callbacks.onStart(event)
    if (nextState === undefined) {
      return false
    }

    stop()
    state = nextState
    pointerId = event.pointerId
    capturePointer(event)

    globalThis.addEventListener('pointermove', handlePointerMove)
    globalThis.addEventListener('pointerup', handlePointerEnd)
    globalThis.addEventListener('pointercancel', handlePointerEnd)
    return true
  }

  tryOnUnmounted(stop)

  return {
    get active() {
      return state !== undefined
    },
    end: handlePointerEnd,
    move: handlePointerMove,
    get state() {
      return state
    },
    start,
    stop,
  }
}
