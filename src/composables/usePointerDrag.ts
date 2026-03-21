interface PointerDragCallbacks<S> {
  onStart: (event: PointerEvent) => S | undefined
  onMove: (event: PointerEvent, state: S) => void
  onEnd: (event: PointerEvent | undefined, state: S) => void
}

interface UsePointerDragResult<S> {
  active: boolean
  state: S | undefined
  start: (event: PointerEvent) => boolean
  stop: (event?: PointerEvent) => void
}

export function usePointerDrag<S>(callbacks: PointerDragCallbacks<S>): UsePointerDragResult<S> {
  let state: S | undefined
  let pointerId: number | undefined

  function removeListeners() {
    globalThis.removeEventListener('pointermove', handlePointerMove)
    globalThis.removeEventListener('pointerup', handlePointerEnd)
    globalThis.removeEventListener('pointercancel', handlePointerEnd)
  }

  function handlePointerMove(event: PointerEvent) {
    if (!state || event.pointerId !== pointerId) {
      return
    }
    callbacks.onMove(event, state)
  }

  function handlePointerEnd(event: PointerEvent) {
    if (event.pointerId !== pointerId) {
      return
    }
    stop(event)
  }

  function stop(event?: PointerEvent) {
    if (!state) {
      return
    }

    const current = state
    state = undefined
    pointerId = undefined
    removeListeners()
    callbacks.onEnd(event, current)
  }

  function start(event: PointerEvent): boolean {
    const nextState = callbacks.onStart(event)
    if (!nextState) {
      return false
    }

    stop()
    state = nextState
    pointerId = event.pointerId

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
    get state() {
      return state
    },
    start,
    stop,
  }
}
