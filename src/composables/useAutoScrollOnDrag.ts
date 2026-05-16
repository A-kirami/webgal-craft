import type { Ref } from 'vue'
import type { DragPosition } from '~/types/drag-drop'

const DEFAULT_EDGE_SIZE = 40
const DEFAULT_MAX_SPEED = 600

export type DragAutoScrollAxis = 'horizontal' | 'vertical'

export interface UseAutoScrollOnDragOptions {
  axis?: DragAutoScrollAxis
  container: Readonly<Ref<HTMLElement | undefined>>
  edgeSize?: number
  maxSpeed?: number
  onScroll?: (position: DragPosition) => void
}

export interface UseAutoScrollOnDragReturn {
  stop: () => void
  update: (position: DragPosition) => void
}

interface ScrollVelocity {
  x: number
  y: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function calcAxisVelocity(
  pointer: number,
  startEdge: number,
  endEdge: number,
  edgeSize: number,
  maxSpeed: number,
): number {
  if (pointer < startEdge + edgeSize) {
    const ratio = clamp((startEdge + edgeSize - pointer) / edgeSize, 0, 1)
    return -maxSpeed * ratio
  }

  if (pointer > endEdge - edgeSize) {
    const ratio = clamp((pointer - (endEdge - edgeSize)) / edgeSize, 0, 1)
    return maxSpeed * ratio
  }

  return 0
}

function calcVelocity(
  position: DragPosition,
  rect: DOMRect,
  edgeSize: number,
  maxSpeed: number,
): ScrollVelocity {
  return {
    x: calcAxisVelocity(position.x, rect.left, rect.right, edgeSize, maxSpeed),
    y: calcAxisVelocity(position.y, rect.top, rect.bottom, edgeSize, maxSpeed),
  }
}

export function useAutoScrollOnDrag(options: UseAutoScrollOnDragOptions): UseAutoScrollOnDragReturn {
  const axis = options.axis ?? 'vertical'
  let pointerPosition: DragPosition | undefined
  let frameId = 0
  let lastTimestamp = 0

  function stop() {
    if (frameId !== 0) {
      cancelAnimationFrame(frameId)
      frameId = 0
    }
    lastTimestamp = 0
    pointerPosition = undefined
  }

  function tick(timestamp: number) {
    const container = options.container.value
    if (!container || !pointerPosition) {
      stop()
      return
    }

    const edgeSize = Math.max(1, options.edgeSize ?? DEFAULT_EDGE_SIZE)
    const maxSpeed = Math.max(0, options.maxSpeed ?? DEFAULT_MAX_SPEED)
    const rect = container.getBoundingClientRect()
    const velocity = calcVelocity(pointerPosition, rect, edgeSize, maxSpeed)
    const axisVelocity = axis === 'horizontal' ? velocity.x : velocity.y

    if (axisVelocity === 0) {
      frameId = 0
      lastTimestamp = 0
      return
    }

    if (lastTimestamp === 0) {
      lastTimestamp = timestamp
    }

    const deltaTime = (timestamp - lastTimestamp) / 1000
    lastTimestamp = timestamp
    const left = axis === 'horizontal' ? velocity.x * deltaTime : 0
    const top = axis === 'vertical' ? velocity.y * deltaTime : 0

    container.scrollBy({
      behavior: 'auto',
      left,
      top,
    })
    if (left !== 0 || top !== 0) {
      options.onScroll?.({ ...pointerPosition })
    }

    frameId = requestAnimationFrame(tick)
  }

  function ensureTicking() {
    if (frameId !== 0) {
      return
    }

    frameId = requestAnimationFrame(tick)
  }

  function update(position: DragPosition) {
    pointerPosition = { ...position }
    ensureTicking()
  }

  tryOnUnmounted(stop)

  return {
    stop,
    update,
  }
}
