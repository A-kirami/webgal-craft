/* eslint-disable unicorn/no-null -- 拖拽会话契约显式使用 null 表示当前没有命中目标。 */
import { useAutoScrollOnDrag } from './useAutoScrollOnDrag'
import { useDragSession } from './useDragSession'
import { useDroppableRegistry } from './useDroppableRegistry'
import { usePointerDrag } from './usePointerDrag'

import type { DragAutoScrollAxis } from './useAutoScrollOnDrag'
import type { DragPayload, DragPosition, DragTransferOperation } from '~/types/drag-drop'

export interface DragTransferAutoScrollOptions {
  axis?: DragAutoScrollAxis
  container: Readonly<Ref<HTMLElement | undefined>>
  edgeSize?: number
  maxSpeed?: number
}

export interface UseDragSourceOptions<TPayload extends DragPayload> {
  autoScroll?: DragTransferAutoScrollOptions
  getData: (element: HTMLElement) => TPayload
  handleSelector?: string
  type: TPayload['type']
}

export interface UseDragSourceReturn {
  sourceProps: () => {
    onClickCapture: (event: MouseEvent) => void
    onPointerdown: (event: PointerEvent) => void
  }
}

function hasClosest(value: EventTarget | null): value is EventTarget & { closest: (selector: string) => Element | null } {
  return Boolean(value && typeof value === 'object' && 'closest' in value)
}

function isHTMLElement(value: unknown): value is HTMLElement {
  if (!value || typeof value !== 'object') {
    return false
  }

  if (typeof HTMLElement === 'undefined') {
    return 'addEventListener' in value && 'removeEventListener' in value && 'style' in value
  }

  return value instanceof HTMLElement
}

function matchesSelectorInside(
  event: PointerEvent,
  sourceElement: HTMLElement,
  selector: string | undefined,
): boolean {
  if (!selector || !hasClosest(event.target)) {
    return false
  }

  const matched = event.target.closest(selector)
  return matched !== null && sourceElement.contains(matched)
}

function canStartDragFromTarget(
  event: PointerEvent,
  sourceElement: HTMLElement,
  handleSelector: string | undefined,
): boolean {
  return !handleSelector || matchesSelectorInside(event, sourceElement, handleSelector)
}

function resolveTransferOperation(event: PointerEvent): DragTransferOperation {
  return event.ctrlKey || event.metaKey ? 'copy' : 'move'
}

function isPositionInAutoScrollLane(
  position: DragPosition,
  element: HTMLElement,
  axis: DragAutoScrollAxis,
): boolean {
  const rect = element.getBoundingClientRect()
  if (axis === 'horizontal') {
    return position.y >= rect.top && position.y <= rect.bottom
  }

  return position.x >= rect.left && position.x <= rect.right
}

export function useDragSource<TPayload extends DragPayload>(
  options: UseDragSourceOptions<TPayload>,
): UseDragSourceReturn {
  const session = useDragSession()
  const registry = useDroppableRegistry()
  const autoScrollOptions = options.autoScroll
  const autoScrollAxis = autoScrollOptions?.axis ?? 'vertical'
  let payload: TPayload | undefined
  let suppressNextClick = false
  let suppressNextClickResetTimer: ReturnType<typeof setTimeout> | undefined

  function clearSuppressNextClickResetTimer(): void {
    if (suppressNextClickResetTimer === undefined) {
      return
    }

    clearTimeout(suppressNextClickResetTimer)
    suppressNextClickResetTimer = undefined
  }

  function scheduleSuppressNextClickReset(): void {
    clearSuppressNextClickResetTimer()
    suppressNextClickResetTimer = setTimeout(() => {
      suppressNextClick = false
      suppressNextClickResetTimer = undefined
    }, 0)
  }

  function updateHover(position: DragPosition): void {
    if (!payload) {
      return
    }

    const match = registry.updateHover(position, payload)
    session.updateDropTarget(match.isDropAllowed ? match.target : null)
  }

  function updateAutoScroll(position: DragPosition): void {
    const container = autoScrollOptions?.container.value
    if (!container) {
      return
    }

    if (!isPositionInAutoScrollLane(position, container, autoScrollAxis)) {
      autoScroll.stop()
      return
    }

    autoScroll.update(position)
  }

  const autoScroll = useAutoScrollOnDrag({
    axis: autoScrollAxis,
    container: autoScrollOptions?.container ?? shallowRef<HTMLElement>(),
    edgeSize: autoScrollOptions?.edgeSize,
    maxSpeed: autoScrollOptions?.maxSpeed,
    onScroll: (position) => {
      if (!payload || !session.state.value.isActive || session.state.value.mode !== 'transfer') {
        return
      }

      session.updatePosition(position)
      updateHover(position)
    },
  })

  function updateSessionTransferOperation(event: PointerEvent): boolean {
    const operation = resolveTransferOperation(event)
    const previousOperation = session.state.value.transferOperation
    session.updateTransferOperation(operation)
    return previousOperation !== operation
  }

  const pointerDrag = usePointerDrag({
    onDragCancel: () => {
      autoScroll.stop()
      registry.clearHover(payload)
      session.cancel()
      payload = undefined
      clearSuppressNextClickResetTimer()
      suppressNextClick = false
    },
    onDragEnd: (event, context) => {
      const currentPayload = payload
      payload = undefined

      if (!currentPayload) {
        autoScroll.stop()
        clearSuppressNextClickResetTimer()
        suppressNextClick = false
        session.end()
        return
      }

      autoScroll.stop()
      updateSessionTransferOperation(event)
      session.updatePosition(context.currentPosition)
      scheduleSuppressNextClickReset()
      const dropResult = registry.drop(currentPayload, context.currentPosition)
      session.end()
      void dropResult.catch((error: unknown) => {
        void logger.error(`拖拽放置失败: ${error instanceof Error ? error.message : String(error)}`)
      })
    },
    onDragMove: (event, context) => {
      if (!payload) {
        return
      }

      const operationChanged = updateSessionTransferOperation(event)
      session.updatePosition(context.currentPosition)
      if (operationChanged) {
        registry.clearHover(payload)
      }
      updateHover(context.currentPosition)
      updateAutoScroll(context.currentPosition)
    },
    onDragStart: (event, context) => {
      payload = options.getData(context.sourceElement)
      if (payload.type !== options.type) {
        payload = undefined
        return false
      }

      clearSuppressNextClickResetTimer()
      suppressNextClick = true
      session.start('transfer', payload, context.startPosition)
      updateSessionTransferOperation(event)
      updateAutoScroll({ x: event.clientX, y: event.clientY })
    },
  })

  return {
    sourceProps() {
      return {
        onClickCapture: (event: MouseEvent) => {
          if (!suppressNextClick) {
            return
          }

          clearSuppressNextClickResetTimer()
          suppressNextClick = false
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation?.()
        },
        onPointerdown: (event: PointerEvent) => {
          const sourceElement = event.currentTarget
          if (!isHTMLElement(sourceElement)) {
            return
          }

          if (canStartDragFromTarget(event, sourceElement, options.handleSelector)) {
            pointerDrag.handlePointerDown(event)
          }
        },
      }
    },
  }
}
