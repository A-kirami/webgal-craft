import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useTransformControl } from '../useTransformControl'

import type { TransformFrame } from '../geometry'
import type { DisplayTransform } from '../model'
import type { ImmediatePointerDragCallbacks, ImmediatePointerDragEvent } from '~/composables/useImmediatePointerDrag'
import type { ReferenceBox } from '~/types/editorPreviewProtocol'

interface PointerDragHarness {
  active: boolean
  callbacks?: ImmediatePointerDragCallbacks<unknown>
  state?: unknown
}

const pointerDragHarness = vi.hoisted<PointerDragHarness>(() => ({
  active: false,
}))

vi.mock('~/composables/useImmediatePointerDrag', () => ({
  useImmediatePointerDrag: vi.fn((callbacks: ImmediatePointerDragCallbacks<unknown>) => {
    pointerDragHarness.callbacks = callbacks

    function stop(event?: ImmediatePointerDragEvent) {
      if (pointerDragHarness.state === undefined) {
        return
      }

      const currentState = pointerDragHarness.state
      pointerDragHarness.active = false
      pointerDragHarness.state = undefined
      callbacks.onEnd(event, currentState)
    }

    return {
      get active() {
        return pointerDragHarness.active
      },
      cancel() {
        if (pointerDragHarness.state === undefined) {
          return
        }

        const currentState = pointerDragHarness.state
        pointerDragHarness.active = false
        pointerDragHarness.state = undefined
        callbacks.onCancel?.(currentState)
      },
      end: stop,
      move(event: ImmediatePointerDragEvent) {
        if (pointerDragHarness.state === undefined) {
          return
        }

        callbacks.onMove(event, pointerDragHarness.state)
      },
      start(event: ImmediatePointerDragEvent) {
        const nextState = callbacks.onStart(event)
        if (nextState === undefined) {
          return false
        }

        pointerDragHarness.active = true
        pointerDragHarness.state = nextState
        return true
      },
      stop,
      get state() {
        return pointerDragHarness.state
      },
    }
  }),
}))

const frame: TransformFrame = {
  anchorX: 0.5,
  anchorY: 0.5,
  height: 100,
  left: 0,
  originX: 50,
  originY: 50,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  top: 0,
  width: 100,
}

const referenceBox: ReferenceBox = {
  originX: 50,
  originY: 50,
  width: 100,
  height: 100,
  anchorX: 0.5,
  anchorY: 0.5,
  stageWidth: 100,
  stageHeight: 100,
}

function createTransform(patch: Partial<DisplayTransform> = {}): DisplayTransform {
  return {
    position: patch.position ?? { x: 0, y: 0 },
    scale: patch.scale ?? { x: 1, y: 1 },
    rotation: patch.rotation ?? 0,
  }
}

function createPointerEvent(options: {
  clientX: number
  clientY: number
  shiftKey?: boolean
}): PointerEvent {
  return {
    altKey: false,
    button: 0,
    buttons: 1,
    clientX: options.clientX,
    clientY: options.clientY,
    pointerId: 1,
    preventDefault: vi.fn(),
    shiftKey: options.shiftKey ?? false,
  } as unknown as PointerEvent
}

function createControl(transform: DisplayTransform = createTransform()) {
  const cancels: undefined[] = []
  const changes: DisplayTransform[] = []
  const rotateTooltips: unknown[] = []
  const control = useTransformControl({
    getBox: () => referenceBox,
    getCanvasPlacement: () => ({ left: 0, scale: 1, top: 0 }),
    getFrame: () => frame,
    getTransform: () => transform,
    onCancel() {
      cancels.push(undefined)
    },
    onChange(transform) {
      changes.push(transform)
    },
    onRotateTooltipChange(tooltip) {
      rotateTooltips.push(tooltip)
    },
  })

  return {
    cancels,
    changes,
    control,
    rotateTooltips,
  }
}

describe('useTransformControl', () => {
  beforeEach(() => {
    pointerDragHarness.active = false
    pointerDragHarness.callbacks = undefined
    pointerDragHarness.state = undefined
    vi.stubGlobal('Element', class Element {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('按 Shift 拖动会锁定主轴并保持锁定方向', () => {
    const { changes, control } = createControl()

    control.start({
      event: createPointerEvent({ clientX: 100, clientY: 100, shiftKey: true }),
      handle: 'move',
    })
    pointerDragHarness.callbacks?.onMove(createPointerEvent({ clientX: 140, clientY: 112, shiftKey: true }), pointerDragHarness.state)
    pointerDragHarness.callbacks?.onMove(createPointerEvent({ clientX: 145, clientY: 160, shiftKey: true }), pointerDragHarness.state)

    expect(changes.at(-1)?.position).toEqual({ x: 45, y: 0 })
  })

  it('拖拽期间会暴露当前活动控件并在结束时提交最后变换', () => {
    const { changes, control } = createControl()

    expect(control.activeHandle).toBeUndefined()

    control.start({
      event: createPointerEvent({ clientX: 100, clientY: 100 }),
      handle: 'e',
    })

    expect(control.active).toBe(true)
    expect(control.activeHandle).toBe('e')

    pointerDragHarness.callbacks?.onMove(createPointerEvent({ clientX: 130, clientY: 50 }), pointerDragHarness.state)
    control.stop()

    expect(control.active).toBe(false)
    expect(control.activeHandle).toBeUndefined()
    expect(changes).toHaveLength(2)
    expect(changes.at(-1)?.scale.x).toBeCloseTo(1.3)
    expect(changes.at(-1)?.position.x).toBeCloseTo(15)
  })

  it('取消拖拽时不会提交最终变换', () => {
    const { cancels, changes, control, rotateTooltips } = createControl()

    control.start({
      event: createPointerEvent({ clientX: 100, clientY: 100 }),
      handle: 'move',
    })
    pointerDragHarness.callbacks?.onMove(createPointerEvent({ clientX: 120, clientY: 100 }), pointerDragHarness.state)

    control.cancel()

    expect(control.active).toBe(false)
    expect(control.activeHandle).toBeUndefined()
    expect(changes).toHaveLength(1)
    expect(changes[0]?.position).toEqual({ x: 20, y: 0 })
    expect(cancels).toHaveLength(1)
    expect(rotateTooltips.at(-1)).toBeUndefined()
  })

  it('底层 pointercancel 会清空拖拽状态并通知取消', () => {
    const { cancels, changes, control } = createControl()

    control.start({
      event: createPointerEvent({ clientX: 100, clientY: 100 }),
      handle: 'move',
    })
    pointerDragHarness.callbacks?.onMove(createPointerEvent({ clientX: 120, clientY: 100 }), pointerDragHarness.state)
    control.cancel()

    expect(control.active).toBe(false)
    expect(control.activeHandle).toBeUndefined()
    expect(changes).toHaveLength(1)
    expect(cancels).toHaveLength(1)
  })

  it('拖拽未开始时不会残留活动控件', () => {
    const { control } = createControl()

    control.start({
      event: {
        ...createPointerEvent({ clientX: 100, clientY: 100 }),
        button: 1,
      },
      handle: 'e',
    })

    expect(control.active).toBe(false)
    expect(control.activeHandle).toBeUndefined()
  })

  it('按 Shift 开始拖动时不会因为轻微抖动提前锁定轴', () => {
    const { changes, control } = createControl()

    control.start({
      event: createPointerEvent({ clientX: 100, clientY: 100, shiftKey: true }),
      handle: 'move',
    })
    pointerDragHarness.callbacks?.onMove(createPointerEvent({ clientX: 101, clientY: 102, shiftKey: true }), pointerDragHarness.state)
    pointerDragHarness.callbacks?.onMove(createPointerEvent({ clientX: 140, clientY: 112, shiftKey: true }), pointerDragHarness.state)

    expect(changes.at(-1)?.position).toEqual({ x: 40, y: 0 })
  })

  it('松开 Shift 后会恢复自由拖动', () => {
    const { changes, control } = createControl()

    control.start({
      event: createPointerEvent({ clientX: 100, clientY: 100, shiftKey: true }),
      handle: 'move',
    })
    pointerDragHarness.callbacks?.onMove(createPointerEvent({ clientX: 140, clientY: 112, shiftKey: true }), pointerDragHarness.state)
    pointerDragHarness.callbacks?.onMove(createPointerEvent({ clientX: 145, clientY: 160, shiftKey: false }), pointerDragHarness.state)

    expect(changes.at(-1)?.position).toEqual({ x: 45, y: 60 })
  })

  it.each([
    {
      name: '未按 Shift 时保持单轴缩放',
      shiftKey: false,
      expectedScale: { x: 1.3, y: 1 },
    },
    {
      name: '按 Shift 时进入等比缩放',
      shiftKey: true,
      expectedScale: { x: 1.3, y: 1.3 },
    },
  ])('边线缩放 $name', ({ expectedScale, shiftKey }) => {
    const { changes, control } = createControl()

    control.start({
      event: createPointerEvent({ clientX: 100, clientY: 50 }),
      handle: 'e',
    })
    pointerDragHarness.callbacks?.onMove(createPointerEvent({ clientX: 130, clientY: 60, shiftKey }), pointerDragHarness.state)

    expect(changes.at(-1)?.scale.x).toBeCloseTo(expectedScale.x)
    expect(changes.at(-1)?.scale.y).toBeCloseTo(expectedScale.y)
  })

  it('负缩放后拖拽视觉右边仍会移动视觉右边', () => {
    const { changes, control } = createControl(createTransform({
      scale: { x: -1, y: 1 },
    }))

    control.start({
      event: createPointerEvent({ clientX: 100, clientY: 50 }),
      handle: 'e',
    })
    pointerDragHarness.callbacks?.onMove(createPointerEvent({ clientX: 130, clientY: 50 }), pointerDragHarness.state)

    expect(changes.at(-1)?.scale.x).toBeCloseTo(-1.3)
    expect(changes.at(-1)?.position.x).toBeCloseTo(15)
  })
})
