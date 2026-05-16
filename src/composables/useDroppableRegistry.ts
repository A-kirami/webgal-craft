/* eslint-disable unicorn/no-null -- 拖拽命中状态契约显式使用 null 表示未命中 */
import type { Ref } from 'vue'
import type { DragPayload, DragPosition } from '~/types/drag-drop'

export interface DroppableConfig {
  accept: DragPayload['type'] | DragPayload['type'][]
  canDrop?: (payload: DragPayload, target: HTMLElement) => boolean
  id: string
  onDragEnter?: (payload: DragPayload, target: HTMLElement) => void
  onDragLeave?: (payload: DragPayload, target: HTMLElement) => void
  onDrop?: (payload: DragPayload, target: HTMLElement) => Promise<void> | void
}

export interface DroppableMatch {
  config: DroppableConfig | null
  isDropAllowed: boolean
  target: HTMLElement | null
}

export interface UseDroppableRegistryReturn {
  clearHover: (payload?: DragPayload) => void
  drop: (payload: DragPayload, position: DragPosition) => Promise<boolean>
  getMatchAt: (position: DragPosition, payload?: DragPayload) => DroppableMatch
  hoveredTarget: Readonly<Ref<HTMLElement | null>>
  isDropAllowed: Readonly<Ref<boolean>>
  registerDroppable: (element: HTMLElement, config: DroppableConfig) => void
  unregisterDroppable: (element: HTMLElement) => void
  updateHover: (position: DragPosition, payload: DragPayload) => DroppableMatch
}

interface ResolvedDroppable {
  config: DroppableConfig
  target: HTMLElement
}

const droppableConfigMap = new WeakMap<HTMLElement, DroppableConfig>()
const hoveredTargetRef = shallowRef<HTMLElement | null>(null)
const isDropAllowedRef = shallowRef(false)
const readonlyHoveredTargetRef = hoveredTargetRef as Readonly<Ref<HTMLElement | null>>
const readonlyIsDropAllowedRef = isDropAllowedRef as Readonly<Ref<boolean>>

let hoveredConfig: DroppableConfig | null = null
let hoveredPayload: DragPayload | null = null

function isHTMLElement(value: Element | null): value is HTMLElement {
  if (!value || typeof value !== 'object') {
    return false
  }

  if (typeof HTMLElement === 'undefined') {
    return 'dataset' in value
  }

  return value instanceof HTMLElement
}

function normalizeAcceptTypes(config: DroppableConfig): DragPayload['type'][] {
  return Array.isArray(config.accept) ? config.accept : [config.accept]
}

function isPayloadAccepted(config: DroppableConfig, payload: DragPayload): boolean {
  return normalizeAcceptTypes(config).includes(payload.type)
}

function resolveDroppableFromNode(startNode: Element | null): ResolvedDroppable | null {
  let cursor: Element | null = startNode
  while (cursor) {
    if (isHTMLElement(cursor)) {
      const config = droppableConfigMap.get(cursor)
      if (config) {
        return {
          config,
          target: cursor,
        }
      }
    }
    cursor = cursor.parentElement
  }

  return null
}

function resolveIsDropAllowed(
  config: DroppableConfig,
  payload?: DragPayload,
  target?: HTMLElement,
): boolean {
  if (!payload || !target) {
    return false
  }

  if (!isPayloadAccepted(config, payload)) {
    return false
  }

  return config.canDrop?.(payload, target) ?? true
}

function getMatchAt(position: DragPosition, payload?: DragPayload): DroppableMatch {
  const startNode = document.elementFromPoint(position.x, position.y)
  const resolved = resolveDroppableFromNode(startNode)
  if (!resolved) {
    return {
      config: null,
      isDropAllowed: false,
      target: null,
    }
  }

  return {
    config: resolved.config,
    isDropAllowed: resolveIsDropAllowed(resolved.config, payload, resolved.target),
    target: resolved.target,
  }
}

function notifyDragLeave(payload?: DragPayload) {
  if (!hoveredTargetRef.value || !hoveredConfig) {
    return
  }

  const effectivePayload = payload ?? hoveredPayload
  if (!effectivePayload) {
    return
  }

  hoveredConfig.onDragLeave?.(effectivePayload, hoveredTargetRef.value)
}

function clearHover(payload?: DragPayload) {
  notifyDragLeave(payload)
  hoveredTargetRef.value = null
  hoveredConfig = null
  hoveredPayload = null
  isDropAllowedRef.value = false
}

function updateHover(position: DragPosition, payload: DragPayload): DroppableMatch {
  const nextMatch = getMatchAt(position, payload)
  const previousTarget = hoveredTargetRef.value
  const previousConfig = hoveredConfig

  if (previousTarget && previousConfig && previousTarget !== nextMatch.target) {
    previousConfig.onDragLeave?.(payload, previousTarget)
  }

  if (nextMatch.target && nextMatch.config && previousTarget !== nextMatch.target) {
    nextMatch.config.onDragEnter?.(payload, nextMatch.target)
  }

  hoveredTargetRef.value = nextMatch.target
  hoveredConfig = nextMatch.config
  hoveredPayload = payload
  isDropAllowedRef.value = nextMatch.isDropAllowed

  return nextMatch
}

function registerDroppable(element: HTMLElement, config: DroppableConfig) {
  droppableConfigMap.set(element, config)
  element.dataset.dropTargetId = config.id
}

function unregisterDroppable(element: HTMLElement) {
  if (hoveredTargetRef.value === element) {
    clearHover()
  }

  const config = droppableConfigMap.get(element)
  droppableConfigMap.delete(element)

  if (config && element.dataset.dropTargetId === config.id) {
    delete element.dataset.dropTargetId
  }
}

async function drop(payload: DragPayload, position: DragPosition): Promise<boolean> {
  const match = updateHover(position, payload)
  if (!match.target || !match.config || !match.isDropAllowed || !match.config.onDrop) {
    clearHover(payload)
    return false
  }

  try {
    await match.config.onDrop(payload, match.target)
  } finally {
    clearHover(payload)
  }
  return true
}

export function useDroppableRegistry(): UseDroppableRegistryReturn {
  return {
    clearHover,
    drop,
    getMatchAt,
    hoveredTarget: readonlyHoveredTargetRef,
    isDropAllowed: readonlyIsDropAllowedRef,
    registerDroppable,
    unregisterDroppable,
    updateHover,
  }
}
