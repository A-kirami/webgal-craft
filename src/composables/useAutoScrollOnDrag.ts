import type { Ref } from 'vue'
import type { DragPosition } from '~/types/drag-drop'

const DEFAULT_EDGE_SIZE = 24
const DEFAULT_MAX_SPEED = 600

export type DragAutoScrollAxis = 'horizontal' | 'vertical'

export interface UseAutoScrollOnDragOptions {
  axis?: DragAutoScrollAxis
  container: Readonly<Ref<HTMLElement | undefined>>
  edgeSize?: number
  maxSpeed?: number
  onScroll?: (position: DragPosition) => void
}

export interface DragAutoScrollBounds {
  bottom: number
  left: number
  right: number
  top: number
}

export interface UseAutoScrollOnDragReturn {
  stop: () => void
  update: (
    position: DragPosition,
    triggerBounds?: DragAutoScrollBounds,
    speedBounds?: DragAutoScrollBounds,
  ) => void
}

interface ScrollVelocity {
  x: number
  y: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function calcAxisVelocity(
  triggerStart: number,
  triggerEnd: number,
  speedStart: number,
  speedEnd: number,
  startEdge: number,
  endEdge: number,
  edgeSize: number,
  maxSpeed: number,
): number {
  const accelerationDistance = edgeSize * 2
  const startVelocity = triggerStart < startEdge + edgeSize
    ? -maxSpeed * clamp((startEdge + edgeSize - speedStart) / accelerationDistance, 0, 1)
    : 0
  const endVelocity = triggerEnd > endEdge - edgeSize
    ? maxSpeed * clamp((speedEnd - (endEdge - edgeSize)) / accelerationDistance, 0, 1)
    : 0

  if (Math.abs(startVelocity) > Math.abs(endVelocity)) {
    return startVelocity
  }

  return endVelocity
}

function calcVelocity(
  triggerBounds: DragAutoScrollBounds,
  speedBounds: DragAutoScrollBounds,
  rect: DOMRect,
  edgeSize: number,
  maxSpeed: number,
): ScrollVelocity {
  return {
    x: calcAxisVelocity(
      triggerBounds.left,
      triggerBounds.right,
      speedBounds.left,
      speedBounds.right,
      rect.left,
      rect.right,
      edgeSize,
      maxSpeed,
    ),
    y: calcAxisVelocity(
      triggerBounds.top,
      triggerBounds.bottom,
      speedBounds.top,
      speedBounds.bottom,
      rect.top,
      rect.bottom,
      edgeSize,
      maxSpeed,
    ),
  }
}

function createPointBounds(position: DragPosition): DragAutoScrollBounds {
  return {
    bottom: position.y,
    left: position.x,
    right: position.x,
    top: position.y,
  }
}

export function useAutoScrollOnDrag(options: UseAutoScrollOnDragOptions): UseAutoScrollOnDragReturn {
  const axis = options.axis ?? 'vertical'
  let pointerPosition: DragPosition | undefined
  let scrollTriggerBounds: DragAutoScrollBounds | undefined
  let scrollSpeedBounds: DragAutoScrollBounds | undefined
  let frameId = 0
  let lastTimestamp: number | undefined

  function stop() {
    if (frameId !== 0) {
      cancelAnimationFrame(frameId)
      frameId = 0
    }
    lastTimestamp = undefined
    pointerPosition = undefined
    scrollTriggerBounds = undefined
    scrollSpeedBounds = undefined
  }

  function tick(timestamp: number) {
    const container = options.container.value
    if (!container || !pointerPosition || !scrollTriggerBounds || !scrollSpeedBounds) {
      stop()
      return
    }

    const edgeSize = Math.max(1, options.edgeSize ?? DEFAULT_EDGE_SIZE)
    const maxSpeed = Math.max(0, options.maxSpeed ?? DEFAULT_MAX_SPEED)
    const rect = container.getBoundingClientRect()
    const velocity = calcVelocity(scrollTriggerBounds, scrollSpeedBounds, rect, edgeSize, maxSpeed)
    const axisVelocity = axis === 'horizontal' ? velocity.x : velocity.y

    if (axisVelocity === 0) {
      frameId = 0
      lastTimestamp = undefined
      return
    }

    if (lastTimestamp === undefined) {
      lastTimestamp = timestamp
      frameId = requestAnimationFrame(tick)
      return
    }

    const deltaTime = (timestamp - lastTimestamp) / 1000
    lastTimestamp = timestamp
    const left = axis === 'horizontal' ? velocity.x * deltaTime : 0
    const top = axis === 'vertical' ? velocity.y * deltaTime : 0

    if (left === 0 && top === 0) {
      frameId = requestAnimationFrame(tick)
      return
    }

    const previousScrollLeft = container.scrollLeft
    const previousScrollTop = container.scrollTop
    container.scrollBy({
      behavior: 'auto',
      left,
      top,
    })

    if (container.scrollLeft === previousScrollLeft && container.scrollTop === previousScrollTop) {
      stop()
      return
    }

    options.onScroll?.({ ...pointerPosition })
    frameId = requestAnimationFrame(tick)
  }

  function ensureTicking() {
    if (frameId !== 0) {
      return
    }

    frameId = requestAnimationFrame(tick)
  }

  function update(
    position: DragPosition,
    triggerBounds: DragAutoScrollBounds = createPointBounds(position),
    speedBounds: DragAutoScrollBounds = triggerBounds,
  ) {
    pointerPosition = { ...position }
    scrollTriggerBounds = { ...triggerBounds }
    scrollSpeedBounds = { ...speedBounds }
    ensureTicking()
  }

  tryOnUnmounted(stop)

  return {
    stop,
    update,
  }
}
