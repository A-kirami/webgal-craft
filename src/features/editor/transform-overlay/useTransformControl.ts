import { useImmediatePointerDrag } from '~/composables/useImmediatePointerDrag'
import { formatEffectRotationDegree } from '~/features/editor/effect-editor/transform-rotation-format'
import { radianToDegree } from '~/utils/math'

import {
  applyMove,
  applyRotate,
  applyScale,
  canvasPointToStagePoint,
} from './geometry'

import type {
  StagePoint,
  TransformFrame,
  TransformScaleHandle,
} from './geometry'
import type { DisplayTransform } from './model'
import type { ReferenceBox } from '~/types/editorPreviewProtocol'

export type TransformControlHandle =
  | 'move'
  | 'rotate'
  | TransformScaleHandle

type MoveAxisLock = 'x' | 'y'

const MOVE_AXIS_LOCK_THRESHOLD = 4
const EDGE_SCALE_HANDLES: ReadonlySet<TransformScaleHandle> = new Set(['n', 'e', 's', 'w'])
const HORIZONTAL_FLIPPED_SCALE_HANDLES: Record<TransformScaleHandle, TransformScaleHandle> = {
  e: 'w',
  n: 'n',
  ne: 'nw',
  nw: 'ne',
  s: 's',
  se: 'sw',
  sw: 'se',
  w: 'e',
}
const VERTICAL_FLIPPED_SCALE_HANDLES: Record<TransformScaleHandle, TransformScaleHandle> = {
  e: 'e',
  n: 's',
  ne: 'se',
  nw: 'sw',
  s: 'n',
  se: 'ne',
  sw: 'nw',
  w: 'w',
}

export interface TransformControlStartOptions {
  event: PointerEvent
  handle: TransformControlHandle
}

export interface UseTransformControlOptions {
  getBox: () => ReferenceBox | undefined
  getCanvasPlacement: () => TransformCanvasPlacement
  getFrame: () => TransformFrame | undefined
  getTransform: () => DisplayTransform
  onCancel?: () => void
  onChange: (transform: DisplayTransform, options?: { flush?: boolean }) => void
  onRotateTooltipChange?: (tooltip: TransformRotateTooltip | undefined) => void
}

export interface TransformCanvasPlacement {
  left: number
  scale: number
  top: number
}

export interface TransformRotateTooltip {
  degree: number
  x: number
  y: number
}

interface TransformDragState {
  canvasOffset: {
    left: number
    top: number
  }
  box: ReferenceBox
  center: StagePoint
  frame: TransformFrame
  latestTransform: DisplayTransform
  moveAxisLock?: MoveAxisLock
  operationHandle: TransformControlHandle
  placement: TransformCanvasPlacement
  rawRotation: number
  startClient: StagePoint
  startPointer: StagePoint
  startTransform: DisplayTransform
  previousRotatePointer: StagePoint
}

function resolveCanvasOffset(event: PointerEvent): { left: number, top: number } {
  const target = event.currentTarget
  if (!(target instanceof Element)) {
    return { left: 0, top: 0 }
  }

  const rect = target.closest('[data-transform-overlay-root]')?.getBoundingClientRect()

  return {
    left: rect?.left ?? 0,
    top: rect?.top ?? 0,
  }
}

function resolveCanvasPointer(
  event: PointerEvent,
  canvasOffset: { left: number, top: number },
  placement: TransformCanvasPlacement,
): StagePoint {
  return {
    x: (event.clientX - canvasOffset.left - placement.left) / placement.scale,
    y: (event.clientY - canvasOffset.top - placement.top) / placement.scale,
  }
}

function resolveStagePointer(
  event: PointerEvent,
  frame: TransformFrame,
  canvasOffset: { left: number, top: number },
  placement: TransformCanvasPlacement,
): StagePoint {
  return canvasPointToStagePoint(resolveCanvasPointer(event, canvasOffset, placement), frame)
}

function resolveFrameCenter(frame: TransformFrame): StagePoint {
  return canvasPointToStagePoint({
    x: frame.originX,
    y: frame.originY,
  }, frame)
}

function formatRotateTooltipDegree(rotation: number): number {
  return formatEffectRotationDegree(radianToDegree(rotation))
}

function resolveMoveAxisLock(delta: StagePoint): MoveAxisLock | undefined {
  if (Math.max(Math.abs(delta.x), Math.abs(delta.y)) < MOVE_AXIS_LOCK_THRESHOLD) {
    return undefined
  }

  return Math.abs(delta.x) >= Math.abs(delta.y) ? 'x' : 'y'
}

function resolveMoveDelta(
  event: PointerEvent,
  delta: StagePoint,
  state: TransformDragState,
): StagePoint {
  if (!event.shiftKey) {
    state.moveAxisLock = undefined
    return delta
  }

  state.moveAxisLock ??= resolveMoveAxisLock({
    x: event.clientX - state.startClient.x,
    y: event.clientY - state.startClient.y,
  })
  if (!state.moveAxisLock) {
    return { x: 0, y: 0 }
  }

  return state.moveAxisLock === 'x'
    ? { x: delta.x, y: 0 }
    : { x: 0, y: delta.y }
}

function resolveRotateTooltip(
  event: PointerEvent,
  canvasOffset: { left: number, top: number },
  transform: DisplayTransform,
): TransformRotateTooltip {
  return {
    degree: formatRotateTooltipDegree(transform.rotation),
    x: event.clientX - canvasOffset.left + 12,
    y: event.clientY - canvasOffset.top + 12,
  }
}

export function resolveRotateTooltipFromEvent(
  event: PointerEvent,
  transform: DisplayTransform,
): TransformRotateTooltip {
  return resolveRotateTooltip(event, resolveCanvasOffset(event), transform)
}

function resolveScaleKeepRatio(handle: TransformScaleHandle, shiftKey: boolean): boolean {
  if (EDGE_SCALE_HANDLES.has(handle)) {
    return shiftKey
  }

  return !shiftKey
}

function resolveModelScaleHandle(
  visualHandle: TransformScaleHandle,
  transform: DisplayTransform,
): TransformScaleHandle {
  // DOM handle 表示当前视觉边；几何缩放需要使用模型局部边来固定正确对边。
  let modelHandle = visualHandle

  if (transform.scale.x < 0) {
    modelHandle = HORIZONTAL_FLIPPED_SCALE_HANDLES[modelHandle]
  }
  if (transform.scale.y < 0) {
    modelHandle = VERTICAL_FLIPPED_SCALE_HANDLES[modelHandle]
  }

  return modelHandle
}

function resolveTransformDragHandle(
  visualHandle: TransformControlHandle,
  transform: DisplayTransform,
): TransformControlHandle {
  if (visualHandle === 'move' || visualHandle === 'rotate') {
    return visualHandle
  }

  return resolveModelScaleHandle(visualHandle, transform)
}

export function useTransformControl(options: UseTransformControlOptions) {
  let activeHandle = $ref<TransformControlHandle>()
  const drag = useImmediatePointerDrag<TransformDragState>({
    onStart(event) {
      const box = options.getBox()
      const frame = options.getFrame()
      const startOptions = pendingStartOptions
      pendingStartOptions = undefined
      if (!box || !frame || !startOptions || event.button !== 0) {
        return
      }

      const pointerEvent = event as PointerEvent
      const canvasOffset = resolveCanvasOffset(pointerEvent)
      const placement = options.getCanvasPlacement()
      const startPointer = resolveStagePointer(pointerEvent, frame, canvasOffset, placement)
      const startTransform = options.getTransform()
      const operationHandle = resolveTransformDragHandle(startOptions.handle, startTransform)

      return {
        canvasOffset,
        box,
        center: resolveFrameCenter(frame),
        frame,
        placement,
        operationHandle,
        previousRotatePointer: startPointer,
        rawRotation: startTransform.rotation,
        startClient: {
          x: pointerEvent.clientX,
          y: pointerEvent.clientY,
        },
        latestTransform: startTransform,
        startPointer,
        startTransform,
      }
    },
    onMove(event, state) {
      const pointer = resolveStagePointer(event as PointerEvent, state.frame, state.canvasOffset, state.placement)
      const transform = resolveNextTransform(event as PointerEvent, pointer, state)

      state.latestTransform = transform
      options.onChange(transform)
      if (state.operationHandle === 'rotate') {
        options.onRotateTooltipChange?.(resolveRotateTooltip(
          event as PointerEvent,
          state.canvasOffset,
          transform,
        ))
      }
    },
    onEnd(event, state) {
      const currentEvent = event as PointerEvent | undefined
      const pointer = currentEvent
        ? resolveStagePointer(currentEvent, state.frame, state.canvasOffset, state.placement)
        : state.startPointer
      const transform = currentEvent
        ? resolveNextTransform(currentEvent, pointer, state)
        : state.latestTransform

      state.latestTransform = transform
      activeHandle = undefined
      options.onChange(transform, { flush: true })
      options.onRotateTooltipChange?.(undefined)
    },
    onCancel() {
      activeHandle = undefined
      options.onRotateTooltipChange?.(undefined)
      options.onCancel?.()
    },
  })

  let pendingStartOptions: TransformControlStartOptions | undefined

  function resolveNextTransform(
    event: PointerEvent,
    pointer: StagePoint,
    state: TransformDragState,
  ): DisplayTransform {
    if (state.operationHandle === 'move') {
      const delta = resolveMoveDelta(event, {
        x: pointer.x - state.startPointer.x,
        y: pointer.y - state.startPointer.y,
      }, state)

      return applyMove({
        delta,
        startTransform: state.startTransform,
      })
    }

    if (state.operationHandle === 'rotate') {
      const result = applyRotate({
        baseTransform: state.startTransform,
        center: state.center,
        currentPointer: pointer,
        previousPointer: state.previousRotatePointer,
        rawRotation: state.rawRotation,
        shiftKey: event.shiftKey,
      })
      state.previousRotatePointer = pointer
      state.rawRotation = result.rawRotation

      return result.transform
    }

    const keepRatio = resolveScaleKeepRatio(state.operationHandle, event.shiftKey)

    return applyScale({
      box: state.box,
      handle: state.operationHandle,
      keepRatio,
      pointerDelta: {
        x: pointer.x - state.startPointer.x,
        y: pointer.y - state.startPointer.y,
      },
      startTransform: state.startTransform,
    })
  }

  function start(options_: TransformControlStartOptions): void {
    pendingStartOptions = options_
    if (!drag.start(options_.event)) {
      pendingStartOptions = undefined
      return
    }

    options_.event.preventDefault()
    activeHandle = options_.handle
  }

  function stop(): void {
    drag.stop()
  }

  function cancel(): void {
    if (!drag.active) {
      return
    }

    drag.cancel()
  }

  return {
    get active() {
      return activeHandle !== undefined && drag.active
    },
    get activeHandle() {
      return activeHandle
    },
    cancel,
    start,
    stop,
  }
}
