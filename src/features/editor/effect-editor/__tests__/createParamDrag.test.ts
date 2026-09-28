import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createParamDrag } from '~/features/editor/effect-editor/createParamDrag'

const { dragRuntime } = vi.hoisted(() => ({
  dragRuntime: {
    callbacks: undefined as undefined | {
      onCancel?: (state: unknown) => void
      onEnd: (event: unknown, state: unknown) => void
      onMove: (event: unknown, state: unknown) => void
      onStart: (event: unknown) => unknown
    },
    state: undefined as unknown,
  },
}))

vi.mock('~/composables/useImmediatePointerDrag', () => ({
  useImmediatePointerDrag(callbacks: {
    onCancel?: (state: unknown) => void
    onEnd: (event: unknown, state: unknown) => void
    onMove: (event: unknown, state: unknown) => void
    onStart: (event: unknown) => unknown
  }) {
    dragRuntime.callbacks = callbacks

    return {
      get active() {
        return dragRuntime.state !== undefined
      },
      cancel() {
        const state = dragRuntime.state
        dragRuntime.state = undefined
        callbacks.onCancel?.(state)
      },
      end(event: unknown) {
        const state = dragRuntime.state
        dragRuntime.state = undefined
        callbacks.onEnd(event, state)
      },
      move(event: unknown) {
        callbacks.onMove(event, dragRuntime.state)
      },
      get state() {
        return dragRuntime.state
      },
      start(event: unknown) {
        dragRuntime.state = callbacks.onStart(event)
        return dragRuntime.state !== undefined
      },
      stop(event?: unknown) {
        const state = dragRuntime.state
        dragRuntime.state = undefined
        callbacks.onEnd(event, state)
      },
    }
  },
}))

function createPointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    altKey: false,
    button: 0,
    buttons: 1,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    pointerType: 'mouse',
    preventDefault: vi.fn(),
    shiftKey: false,
    ...overrides,
  } as unknown as PointerEvent
}

function createClickEvent(): MouseEvent {
  return { preventDefault: vi.fn() } as unknown as MouseEvent
}

function createFixture() {
  const onEnd = vi.fn()
  const onMove = vi.fn()
  const { drag, handleClick, start } = createParamDrag<{ key: string }, { moved: boolean }>({
    onEnd,
    onMove,
    onStart: () => ({ moved: true }),
  })

  return { drag, handleClick, onEnd, onMove, start }
}

describe('createParamDrag', () => {
  beforeEach(() => {
    dragRuntime.callbacks = undefined
    dragRuntime.state = undefined
  })

  it('拖动之后的点击会被阻止一次，避免 label 把焦点送进输入框', () => {
    const { handleClick, start } = createFixture()

    start(createPointerEvent(), { key: 'blur' })
    dragRuntime.callbacks?.onMove(createPointerEvent({ clientX: 40 }), dragRuntime.state)

    const dragClick = createClickEvent()
    handleClick(dragClick)

    expect(dragClick.preventDefault).toHaveBeenCalledOnce()

    const nextClick = createClickEvent()
    handleClick(nextClick)

    expect(nextClick.preventDefault).not.toHaveBeenCalled()
  })

  it('没有拖动的点击不会被阻止', () => {
    const { handleClick, start } = createFixture()

    start(createPointerEvent(), { key: 'blur' })
    dragRuntime.callbacks?.onEnd(createPointerEvent(), dragRuntime.state)

    const click = createClickEvent()
    handleClick(click)

    expect(click.preventDefault).not.toHaveBeenCalled()
  })

  it('拖拽取消后不会吞掉下一次点击', () => {
    const { drag, handleClick, start } = createFixture()

    start(createPointerEvent(), { key: 'blur' })
    dragRuntime.callbacks?.onMove(createPointerEvent({ clientX: 40 }), dragRuntime.state)
    drag.cancel()

    const click = createClickEvent()
    handleClick(click)

    expect(click.preventDefault).not.toHaveBeenCalled()
  })
})
