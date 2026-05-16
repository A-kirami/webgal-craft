export interface ImmediatePointerDragCallbacks<S> {
  onStart: (event: PointerEvent) => S | undefined
  onMove: (event: PointerEvent, state: S) => void
  onEnd: (event: PointerEvent | undefined, state: S) => void
}

export interface UseImmediatePointerDragResult<S> {
  active: boolean
  state: S | undefined
  start: (event: PointerEvent) => boolean
  stop: (event?: PointerEvent) => void
}

export function useImmediatePointerDrag<S>(
  callbacks: ImmediatePointerDragCallbacks<S>,
): UseImmediatePointerDragResult<S> {
  let state: S | undefined
  let pointerId: number | undefined

  function removeListeners() {
    globalThis.removeEventListener('pointermove', handlePointerMove)
    globalThis.removeEventListener('pointerup', handlePointerEnd)
    globalThis.removeEventListener('pointercancel', handlePointerEnd)
  }

  function handlePointerMove(event: PointerEvent) {
    if (state === undefined || event.pointerId !== pointerId) {
      return
    }

    if (event.buttons === 0) {
      stop(event)
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
    if (state === undefined) {
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
    if (nextState === undefined) {
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
