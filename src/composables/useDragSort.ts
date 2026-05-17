import { useAutoScrollOnDrag } from './useAutoScrollOnDrag'
import { useDragSession } from './useDragSession'
import { usePointerDrag } from './usePointerDrag'

import type { DragAutoScrollBounds } from './useAutoScrollOnDrag'
import type { Ref, StyleValue } from 'vue'
import type { DragPayload, DragPosition } from '~/types/drag-drop'

export type DragSortDirection = 'horizontal' | 'vertical'
export type DragSortPhase = 'dragging' | 'idle' | 'settling'

export interface DragSortOverlayState<T> {
  item: T
  key: string
  overlayFrameStyle: StyleValue
  overlayStyle: StyleValue
  phase: DragSortPhase
}

export interface DragSortVirtualItem {
  index: number
  size: number
  start: number
}

export interface DragSortVirtualAdapter {
  getEstimatedItemSize: () => number
  getItemCount: () => number
  getScrollOffset: () => number
  getVisibleItems: () => DragSortVirtualItem[]
  invalidate: () => void
}

export interface UseDragSortOptions<T> {
  autoScroll?: boolean
  direction: DragSortDirection
  getKey: (item: T, index: number, element?: HTMLElement) => string
  getPayload: (item: T, index: number, element: HTMLElement) => DragPayload
  handleSelector?: string
  ignoreSelector?: string
  items: Readonly<Ref<readonly T[]>>
  onSort: (fromIndex: number, targetIndex: number) => void
  scrollContainer?: Ref<HTMLElement | undefined>
  virtualAdapter?: DragSortVirtualAdapter
}

export interface UseDragSortReturn<T> {
  containerRef: Ref<HTMLElement | undefined>
  dragIndex: Ref<number>
  getItemProps: (index: number) => {
    'data-drag-index': number
    'onClickCapture': (event: MouseEvent) => void
    'onPointerdown': (event: PointerEvent) => void
  }
  getItemStyle: (index: number) => StyleValue
  isSorting: Ref<boolean>
  overlayState: Ref<DragSortOverlayState<T> | undefined>
  phase: Ref<DragSortPhase>
  targetIndex: Ref<number>
}

interface AxisRect {
  crossSize: number
  crossStart: number
  mainSize: number
  mainStart: number
}

interface DragSortItemSnapshot<T> {
  crossSize: number
  crossStart: number
  index: number
  item: T
  key: string
  mainSize: number
  mainStartInContent: number
}

interface DragSortViewportSnapshot {
  crossSize: number
  crossStart: number
  mainSize: number
  mainStart: number
  scrollOffset: number
}

interface DragSortSnapshot<T> {
  items: DragSortItemSnapshot<T>[]
  viewport: DragSortViewportSnapshot
}

interface ProjectedDragSortItem<T> extends DragSortItemSnapshot<T> {
  projectedIndex: number
  projectedMainStartInContent: number
}

interface DragSortState<T> {
  draggedItem: DragSortItemSnapshot<T>
  initialTargetIndex: number
  pointerOffsetInItem: number
  snapshots: DragSortItemSnapshot<T>[]
  viewport: DragSortViewportSnapshot
}

interface DragSortCommitSnapshot {
  draggedKey: string
  initialTargetIndex: number
  projectedKeys: string[]
  targetIndex: number
}

interface LayoutRect {
  crossSize: number
  crossStart: number
  mainSize: number
  mainStart: number
}

interface FixedRect {
  height: number
  width: number
  x: number
  y: number
}

const EMPTY_STYLE = {}
const SETTLING_DURATION_MS = 120
const SETTLING_TIMEOUT_MS = SETTLING_DURATION_MS + 40

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getElementIndex(element: HTMLElement): number {
  return Number(element.dataset.dragIndex)
}

function getScrollOffset(element: HTMLElement, direction: DragSortDirection): number {
  return direction === 'horizontal' ? element.scrollLeft : element.scrollTop
}

function getPointerMain(position: DragPosition, direction: DragSortDirection): number {
  return direction === 'horizontal' ? position.x : position.y
}

function getAxisRect(rect: DOMRect, direction: DragSortDirection): AxisRect {
  if (direction === 'horizontal') {
    return {
      crossSize: rect.height,
      crossStart: rect.top,
      mainSize: rect.width,
      mainStart: rect.left,
    }
  }

  return {
    crossSize: rect.width,
    crossStart: rect.left,
    mainSize: rect.height,
    mainStart: rect.top,
  }
}

function createTranslate(direction: DragSortDirection, distance: number): string {
  return direction === 'horizontal'
    ? `translate3d(${distance}px, 0, 0)`
    : `translate3d(0, ${distance}px, 0)`
}

function getFixedRect(direction: DragSortDirection, rect: LayoutRect): FixedRect {
  return {
    height: Math.round(direction === 'horizontal' ? rect.crossSize : rect.mainSize),
    width: Math.round(direction === 'horizontal' ? rect.mainSize : rect.crossSize),
    x: Math.round(direction === 'horizontal' ? rect.mainStart : rect.crossStart),
    y: Math.round(direction === 'horizontal' ? rect.crossStart : rect.mainStart),
  }
}

function createOverlayFrameStyle(direction: DragSortDirection, viewport: DragSortViewportSnapshot): StyleValue {
  const { height, width, x, y } = getFixedRect(direction, viewport)
  const right = x + width
  const bottom = y + height

  return {
    clipPath: `inset(${y}px calc(100% - ${right}px) calc(100% - ${bottom}px) ${x}px)`,
  }
}

function createOverlayStyle(direction: DragSortDirection, rect: LayoutRect, transition: string): StyleValue {
  const { height, width, x, y } = getFixedRect(direction, rect)

  return {
    height: `${height}px`,
    transform: `translate3d(${x}px, ${y}px, 0)`,
    transition,
    width: `${width}px`,
    zIndex: '9999',
  }
}

function createAutoScrollBoundsFromRect(direction: DragSortDirection, rect: LayoutRect): DragAutoScrollBounds {
  const { height, width, x, y } = getFixedRect(direction, rect)

  return {
    bottom: y + height,
    left: x,
    right: x + width,
    top: y,
  }
}

function projectIndexAfterRemoval(index: number, removedIndex: number): number {
  return index > removedIndex ? index - 1 : index
}

function hasClosest(value: EventTarget | null): value is EventTarget & { closest: (selector: string) => Element | null } {
  return Boolean(value && typeof value === 'object' && 'closest' in value)
}

function isHTMLElement(value: EventTarget | null): value is HTMLElement {
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

function isHandleAllowed(
  event: PointerEvent,
  sourceElement: HTMLElement,
  handleSelector: string | undefined,
): boolean {
  if (!handleSelector) {
    return true
  }

  return matchesSelectorInside(event, sourceElement, handleSelector)
}

function sameSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index])
}

function shouldReduceMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export function useDragSort<T>(options: UseDragSortOptions<T>): UseDragSortReturn<T> {
  const session = useDragSession()
  const containerRef = shallowRef<HTMLElement>()
  const phase = shallowRef<DragSortPhase>('idle')
  const isSorting = shallowRef(false)
  const dragIndex = shallowRef(-1)
  const targetIndex = shallowRef(-1)
  const overlayState = shallowRef<DragSortOverlayState<T>>()

  const scrollContainer = options.scrollContainer ?? containerRef
  const autoScroll = useAutoScrollOnDrag({
    axis: options.direction,
    container: scrollContainer,
    onScroll: (position) => {
      if (phase.value !== 'dragging') {
        return
      }

      session.updatePosition(position)
      updateDrag(position)
    },
  })

  let state: DragSortState<T> | undefined
  let commitSnapshot: DragSortCommitSnapshot | undefined
  let suppressNextClick = false
  let settlingTimerId: ReturnType<typeof setTimeout> | undefined

  function getViewportElement(): HTMLElement | undefined {
    return scrollContainer.value ?? containerRef.value
  }

  function getItemElements(): HTMLElement[] {
    return [...containerRef.value?.querySelectorAll<HTMLElement>('[data-drag-index]') ?? []]
      .filter(element => Number.isInteger(getElementIndex(element)))
      .toSorted((left, right) => getElementIndex(left) - getElementIndex(right))
  }

  function getCurrentViewportSnapshot(): DragSortViewportSnapshot | undefined {
    const viewport = getViewportElement()
    if (!viewport) {
      return
    }

    const rect = viewport.getBoundingClientRect()
    const axis = getAxisRect(rect, options.direction)

    return {
      ...axis,
      scrollOffset: options.virtualAdapter?.getScrollOffset() ?? getScrollOffset(viewport, options.direction),
    }
  }

  function createSnapshotItem(
    element: HTMLElement,
    viewport: DragSortViewportSnapshot,
  ): DragSortItemSnapshot<T> | undefined {
    const index = getElementIndex(element)
    const item = options.items.value[index]
    if (item === undefined) {
      return
    }

    const rect = element.getBoundingClientRect()
    const axis = getAxisRect(rect, options.direction)

    return {
      crossSize: axis.crossSize,
      crossStart: axis.crossStart,
      index,
      item,
      key: options.getKey(item, index, element),
      mainSize: axis.mainSize,
      mainStartInContent: axis.mainStart - viewport.mainStart + viewport.scrollOffset,
    }
  }

  function createSnapshotItems(viewport: DragSortViewportSnapshot): DragSortItemSnapshot<T>[] {
    return getItemElements()
      .map(element => createSnapshotItem(element, viewport))
      .filter((item): item is DragSortItemSnapshot<T> => item !== undefined)
  }

  function getVirtualItemAxis(
    virtualItem: DragSortVirtualItem,
    element: HTMLElement | undefined,
    viewport: DragSortViewportSnapshot,
  ): AxisRect {
    if (element) {
      return getAxisRect(element.getBoundingClientRect(), options.direction)
    }

    return {
      crossSize: viewport.crossSize,
      crossStart: viewport.crossStart,
      mainSize: virtualItem.size,
      mainStart: viewport.mainStart + virtualItem.start - viewport.scrollOffset,
    }
  }

  function createVirtualSnapshotItems(
    viewport: DragSortViewportSnapshot,
  ): DragSortItemSnapshot<T>[] {
    const adapter = options.virtualAdapter
    if (!adapter) {
      return []
    }

    const elementMap = new Map(getItemElements().map(element => [getElementIndex(element), element]))

    return adapter.getVisibleItems()
      .map((virtualItem): DragSortItemSnapshot<T> | undefined => {
        const item = options.items.value[virtualItem.index]
        if (item === undefined) {
          return undefined
        }

        const element = elementMap.get(virtualItem.index)
        const axis = getVirtualItemAxis(virtualItem, element, viewport)

        return {
          crossSize: axis.crossSize,
          crossStart: axis.crossStart,
          index: virtualItem.index,
          item,
          key: options.getKey(item, virtualItem.index, element),
          mainSize: virtualItem.size,
          mainStartInContent: virtualItem.start,
        }
      })
      .filter((item): item is DragSortItemSnapshot<T> => item !== undefined)
  }

  function createSnapshot(): DragSortSnapshot<T> | undefined {
    const viewport = getCurrentViewportSnapshot()
    if (!viewport) {
      return
    }

    return {
      items: options.virtualAdapter
        ? createVirtualSnapshotItems(viewport)
        : createSnapshotItems(viewport),
      viewport,
    }
  }

  function getCurrentSnapshotItems(dragState: DragSortState<T>): DragSortItemSnapshot<T>[] {
    if (!options.virtualAdapter) {
      return dragState.snapshots
    }

    const viewport = getCurrentViewportSnapshot() ?? dragState.viewport
    return createVirtualSnapshotItems(viewport)
  }

  function getProjectedItems(dragState: DragSortState<T> | undefined = state): ProjectedDragSortItem<T>[] {
    if (!dragState) {
      return []
    }

    const { draggedItem } = dragState

    return getCurrentSnapshotItems(dragState)
      .filter(item => item.key !== draggedItem.key)
      .map((item, projectedIndex) => {
        const nextProjectedIndex = options.virtualAdapter
          ? projectIndexAfterRemoval(item.index, draggedItem.index)
          : projectedIndex

        return {
          ...item,
          projectedIndex: nextProjectedIndex,
          projectedMainStartInContent: item.index > draggedItem.index
            ? item.mainStartInContent - draggedItem.mainSize
            : item.mainStartInContent,
        }
      })
  }

  function getProjectedKeys(items: readonly T[], draggedKey: string): string[] {
    return items
      .map((item, index) => options.getKey(item, index))
      .filter(key => key !== draggedKey)
  }

  function clampMainStartInViewport(
    mainStart: number,
    viewport: DragSortViewportSnapshot,
    draggedItem: DragSortItemSnapshot<T>,
  ): number {
    const minMainStart = viewport.mainStart
    const maxMainStart = Math.max(minMainStart, viewport.mainStart + viewport.mainSize - draggedItem.mainSize)
    return clamp(mainStart, minMainStart, maxMainStart)
  }

  function getCrossStartInViewport(
    dragState: DragSortState<T>,
    viewport: DragSortViewportSnapshot,
  ): number {
    const { draggedItem } = dragState
    return viewport.crossStart + (draggedItem.crossStart - dragState.viewport.crossStart)
  }

  function createLayoutRectFromMainStart(
    dragState: DragSortState<T>,
    viewport: DragSortViewportSnapshot,
    mainStart: number,
  ): LayoutRect {
    const { draggedItem } = dragState

    return {
      crossSize: draggedItem.crossSize,
      crossStart: getCrossStartInViewport(dragState, viewport),
      mainSize: draggedItem.mainSize,
      mainStart,
    }
  }

  function getOverlayMainStartInViewport(
    position: DragPosition,
    viewport: DragSortViewportSnapshot,
    draggedItem: DragSortItemSnapshot<T>,
    pointerOffsetInItem: number,
  ): number {
    return clampMainStartInViewport(
      getLogicalOverlayMainStartInViewport(position, pointerOffsetInItem),
      viewport,
      draggedItem,
    )
  }

  function getLogicalOverlayMainStartInViewport(
    position: DragPosition,
    pointerOffsetInItem: number,
  ): number {
    return getPointerMain(position, options.direction) - pointerOffsetInItem
  }

  function getOverlayMainStartInContent(
    position: DragPosition,
    viewport: DragSortViewportSnapshot,
    draggedItem: DragSortItemSnapshot<T>,
    pointerOffsetInItem: number,
  ): number {
    return getOverlayMainStartInViewport(
      position,
      viewport,
      draggedItem,
      pointerOffsetInItem,
    ) - viewport.mainStart + viewport.scrollOffset
  }

  function getOverlayMainBoundsInContent(position: DragPosition): { end: number, start: number } | undefined {
    const dragState = state
    const viewport = getCurrentViewportSnapshot()
    if (!dragState || !viewport) {
      return
    }

    const { draggedItem } = dragState
    const start = getOverlayMainStartInContent(
      position,
      viewport,
      draggedItem,
      dragState.pointerOffsetInItem,
    )

    return {
      end: start + draggedItem.mainSize,
      start,
    }
  }

  function resolveEstimatedVirtualTargetIndex(
    mainInContent: number,
    adapter: DragSortVirtualAdapter,
  ): number {
    const itemCount = adapter.getItemCount()
    if (itemCount === 0) {
      return 0
    }

    const estimatedItemSize = Math.max(1, adapter.getEstimatedItemSize())
    return clamp(
      Math.round(mainInContent / estimatedItemSize),
      0,
      itemCount - 1,
    )
  }

  function resolveVirtualTargetIndex(position: DragPosition): number | undefined {
    const dragState = state
    const adapter = options.virtualAdapter
    if (!dragState || !adapter) {
      return
    }

    const { draggedItem } = dragState
    const overlayBounds = getOverlayMainBoundsInContent(position)
    if (!overlayBounds) {
      return
    }

    if (overlayBounds.start === draggedItem.mainStartInContent) {
      return dragState.initialTargetIndex
    }

    const isMovingDown = overlayBounds.start > draggedItem.mainStartInContent
    const leadingMainInContent = isMovingDown ? overlayBounds.end : overlayBounds.start
    const projectedItems = getProjectedItems(dragState)
    const firstProjectedItem = projectedItems[0]
    const lastProjectedItem = projectedItems.at(-1)

    if (firstProjectedItem && lastProjectedItem) {
      const firstMainStart = firstProjectedItem.mainStartInContent
      const lastMainEnd = lastProjectedItem.mainStartInContent + lastProjectedItem.mainSize

      if (leadingMainInContent >= firstMainStart && leadingMainInContent <= lastMainEnd) {
        const targetItem = projectedItems.find((item) => {
          const midpoint = item.mainStartInContent + item.mainSize / 2
          return isMovingDown
            ? leadingMainInContent < midpoint
            : leadingMainInContent <= midpoint
        })
        const nextIndex = targetItem?.projectedIndex ?? lastProjectedItem.projectedIndex + 1
        return clamp(nextIndex, 0, Math.max(0, adapter.getItemCount() - 1))
      }
    }

    return resolveEstimatedVirtualTargetIndex(leadingMainInContent, adapter)
  }

  function resolveTargetIndex(position: DragPosition): number {
    const virtualTargetIndex = resolveVirtualTargetIndex(position)
    if (virtualTargetIndex !== undefined) {
      return virtualTargetIndex
    }

    const dragState = state
    const overlayBounds = getOverlayMainBoundsInContent(position)

    if (!dragState || !overlayBounds) {
      return targetIndex.value === -1 ? dragIndex.value : targetIndex.value
    }

    const { draggedItem } = dragState
    const projectedItems = getProjectedItems(dragState)

    if (overlayBounds.start === draggedItem.mainStartInContent) {
      return dragState.initialTargetIndex
    }

    if (overlayBounds.start > draggedItem.mainStartInContent) {
      const nextIndex = projectedItems.findIndex((item) => {
        const midpoint = item.mainStartInContent + item.mainSize / 2
        return overlayBounds.end < midpoint
      })

      return nextIndex === -1 ? projectedItems.length : nextIndex
    }

    const nextIndex = projectedItems.findIndex((item) => {
      const midpoint = item.mainStartInContent + item.mainSize / 2
      return overlayBounds.start <= midpoint
    })

    return nextIndex === -1 ? projectedItems.length : nextIndex
  }

  function createOverlayRect(
    position: DragPosition,
    viewport: DragSortViewportSnapshot,
  ): LayoutRect | undefined {
    const dragState = state
    if (!dragState) {
      return
    }

    const { draggedItem } = dragState
    const nextMainStart = getOverlayMainStartInViewport(
      position,
      viewport,
      draggedItem,
      dragState.pointerOffsetInItem,
    )

    return createLayoutRectFromMainStart(dragState, viewport, nextMainStart)
  }

  function createLogicalOverlayRect(
    position: DragPosition,
    viewport: DragSortViewportSnapshot,
  ): LayoutRect | undefined {
    const dragState = state
    if (!dragState) {
      return
    }

    const nextMainStart = getLogicalOverlayMainStartInViewport(
      position,
      dragState.pointerOffsetInItem,
    )

    return createLayoutRectFromMainStart(dragState, viewport, nextMainStart)
  }

  function createAutoScrollBounds(
    position: DragPosition,
    createRect: (position: DragPosition, viewport: DragSortViewportSnapshot) => LayoutRect | undefined,
  ): DragAutoScrollBounds | undefined {
    const viewport = getCurrentViewportSnapshot()
    if (!viewport) {
      return
    }

    const rect = createRect(position, viewport)
    if (!rect) {
      return
    }

    return createAutoScrollBoundsFromRect(options.direction, rect)
  }

  function getTargetSlotMainStartInContent(
    draggedItem: DragSortItemSnapshot<T>,
    projectedItems: ProjectedDragSortItem<T>[],
  ): number {
    const maxTargetIndex = options.virtualAdapter
      ? Math.max(0, options.virtualAdapter.getItemCount() - 1)
      : projectedItems.length
    const clampedTargetIndex = clamp(targetIndex.value, 0, maxTargetIndex)
    const targetItem = options.virtualAdapter
      ? projectedItems.find(item => item.projectedIndex >= clampedTargetIndex)
      : projectedItems[clampedTargetIndex]

    if (targetItem) {
      return targetItem.projectedMainStartInContent
    }

    const lastProjectedItem = projectedItems.at(-1)
    return lastProjectedItem
      ? lastProjectedItem.projectedMainStartInContent + lastProjectedItem.mainSize
      : draggedItem.mainStartInContent
  }

  function createTargetSlotRect(viewport: DragSortViewportSnapshot): LayoutRect | undefined {
    const dragState = state
    if (!dragState) {
      return
    }

    const { draggedItem } = dragState
    const slotMainStartInContent = getTargetSlotMainStartInContent(
      draggedItem,
      getProjectedItems(dragState),
    )
    const slotMainStartInViewport = viewport.mainStart + slotMainStartInContent - viewport.scrollOffset
    const slotMainStart = options.virtualAdapter
      ? slotMainStartInViewport
      : clampMainStartInViewport(slotMainStartInViewport, viewport, draggedItem)

    return createLayoutRectFromMainStart(dragState, viewport, slotMainStart)
  }

  function updateOverlay(position: DragPosition, nextPhase: DragSortPhase, transition: string) {
    const draggedItem = state?.draggedItem
    const viewport = getCurrentViewportSnapshot()
    if (!draggedItem || !viewport) {
      overlayState.value = undefined
      return
    }

    const rect = nextPhase === 'settling'
      ? createTargetSlotRect(viewport)
      : createOverlayRect(position, viewport)
    if (!rect) {
      overlayState.value = undefined
      return
    }

    overlayState.value = {
      item: draggedItem.item,
      key: draggedItem.key,
      overlayFrameStyle: createOverlayFrameStyle(options.direction, viewport),
      overlayStyle: createOverlayStyle(options.direction, rect, transition),
      phase: nextPhase,
    }
  }

  function updateDrag(position: DragPosition) {
    const nextTargetIndex = resolveTargetIndex(position)
    targetIndex.value = nextTargetIndex
    updateOverlay(position, 'dragging', 'none')
  }

  function clearSettlingTimer() {
    if (settlingTimerId !== undefined) {
      clearTimeout(settlingTimerId)
      settlingTimerId = undefined
    }
  }

  function resetSortState({ preserveClickSuppression = false } = {}) {
    clearSettlingTimer()
    autoScroll.stop()
    if (!preserveClickSuppression) {
      suppressNextClick = false
    }
    state = undefined
    commitSnapshot = undefined
    phase.value = 'idle'
    isSorting.value = false
    dragIndex.value = -1
    targetIndex.value = -1
    overlayState.value = undefined
  }

  function endSortSession() {
    resetSortState({ preserveClickSuppression: true })
    session.end()
  }

  function finishCommit() {
    const snapshot = commitSnapshot
    if (!snapshot) {
      endSortSession()
      return
    }

    const currentItems = options.items.value
    const currentFromIndex = currentItems.findIndex((item, index) => options.getKey(item, index) === snapshot.draggedKey)
    if (currentFromIndex === -1) {
      endSortSession()
      return
    }

    const currentProjectedKeys = getProjectedKeys(currentItems, snapshot.draggedKey)
    if (!sameSequence(currentProjectedKeys, snapshot.projectedKeys)) {
      endSortSession()
      return
    }

    if (snapshot.targetIndex !== snapshot.initialTargetIndex) {
      options.onSort(currentFromIndex, snapshot.targetIndex)
      if (options.virtualAdapter) {
        void nextTick(() => {
          options.virtualAdapter?.invalidate()
        })
      }
    }

    endSortSession()
  }

  function scheduleCommit() {
    clearSettlingTimer()
    if (shouldReduceMotion()) {
      finishCommit()
      return
    }

    settlingTimerId = globalThis.setTimeout(() => {
      settlingTimerId = undefined
      finishCommit()
    }, SETTLING_TIMEOUT_MS)
  }

  function startSort(event: PointerEvent, sourceElement: HTMLElement, startPosition: DragPosition): boolean {
    if (phase.value === 'settling' || settlingTimerId !== undefined) {
      return false
    }

    const index = getElementIndex(sourceElement)
    const itemCount = options.items.value.length
    if (!Number.isInteger(index) || index < 0 || index >= itemCount) {
      return false
    }

    const snapshot = createSnapshot()
    if (!snapshot) {
      return false
    }

    const draggedItem = snapshot.items.find(item => item.index === index)
    if (!draggedItem) {
      return false
    }

    state = {
      draggedItem,
      initialTargetIndex: index,
      pointerOffsetInItem: getPointerMain(startPosition, options.direction)
        - (draggedItem.mainStartInContent - snapshot.viewport.scrollOffset + snapshot.viewport.mainStart),
      snapshots: snapshot.items,
      viewport: snapshot.viewport,
    }
    suppressNextClick = true
    dragIndex.value = index
    targetIndex.value = index
    phase.value = 'dragging'
    isSorting.value = true
    session.start('sort', options.getPayload(draggedItem.item, index, sourceElement), startPosition)
    updateDrag({ x: event.clientX, y: event.clientY })
    return true
  }

  function settle(position: DragPosition) {
    const dragState = state
    if (!dragState) {
      endSortSession()
      return
    }

    const { draggedItem } = dragState
    autoScroll.stop()
    updateDrag(position)
    commitSnapshot = {
      draggedKey: draggedItem.key,
      initialTargetIndex: dragState.initialTargetIndex,
      projectedKeys: getProjectedKeys(options.items.value, draggedItem.key),
      targetIndex: clamp(targetIndex.value, 0, Math.max(0, options.items.value.length - 1)),
    }
    phase.value = 'settling'
    updateOverlay(position, 'settling', `transform ${SETTLING_DURATION_MS}ms ease`)
    scheduleCommit()
  }

  const pointerDrag = usePointerDrag({
    onDragCancel: () => {
      session.cancel()
      resetSortState()
    },
    onDragEnd: (_event, context) => {
      session.updatePosition(context.currentPosition)
      settle(context.currentPosition)
    },
    onDragMove: (_event, context) => {
      const currentPosition = context.currentPosition

      session.updatePosition(currentPosition)
      updateDrag(currentPosition)

      if (options.autoScroll !== false) {
        autoScroll.update(
          currentPosition,
          createAutoScrollBounds(currentPosition, createOverlayRect),
          createAutoScrollBounds(currentPosition, createLogicalOverlayRect),
        )
      }
    },
    onDragStart: (event, context) => startSort(event, context.sourceElement, context.startPosition),
  })

  function getItemProps(index: number) {
    return {
      'data-drag-index': index,
      'onClickCapture': (event: MouseEvent) => {
        if (!suppressNextClick) {
          return
        }

        suppressNextClick = false
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation?.()
      },
      'onPointerdown': (event: PointerEvent) => {
        const sourceElement = event.currentTarget
        if (!isHTMLElement(sourceElement)) {
          return
        }

        if (matchesSelectorInside(event, sourceElement, options.ignoreSelector)) {
          return
        }

        if (!isHandleAllowed(event, sourceElement, options.handleSelector)) {
          return
        }

        pointerDrag.handlePointerDown(event)
      },
    }
  }

  function getItemStyle(index: number): StyleValue {
    const dragState = state
    if (phase.value === 'idle' || !dragState || dragIndex.value === -1 || targetIndex.value === -1) {
      return EMPTY_STYLE
    }

    const { draggedItem } = dragState

    if (index === draggedItem.index) {
      return {
        opacity: '0',
      }
    }

    const projectedItem = getProjectedItems(dragState).find(item => item.index === index)
    if (!projectedItem) {
      return EMPTY_STYLE
    }

    const finalMainStart = projectedItem.projectedIndex >= targetIndex.value
      ? projectedItem.projectedMainStartInContent + draggedItem.mainSize
      : projectedItem.projectedMainStartInContent
    const offset = finalMainStart - projectedItem.mainStartInContent

    return {
      transform: createTranslate(options.direction, offset),
      transition: `transform ${SETTLING_DURATION_MS}ms ease`,
    }
  }

  tryOnUnmounted(() => {
    session.cancel()
    resetSortState()
  })

  return {
    containerRef,
    dragIndex,
    getItemProps,
    getItemStyle,
    isSorting,
    overlayState,
    phase,
    targetIndex,
  }
}
