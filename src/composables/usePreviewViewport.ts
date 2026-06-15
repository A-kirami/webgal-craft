import { useImmediatePointerDrag } from './useImmediatePointerDrag'

import type { ImmediatePointerDragEvent } from './useImmediatePointerDrag'

const DEFAULT_MAX_ZOOM = 8
const DEFAULT_ZOOM_STEP = 1.1

export interface PreviewViewportSize {
  height: number
  width: number
}

export interface PreviewViewportPoint {
  x: number
  y: number
}

export interface UsePreviewViewportOptions {
  getCanvasSize: () => PreviewViewportSize
  getViewportElement: () => HTMLElement | null | undefined
  maxZoom?: number
  zoomStep?: number
}

export interface PreviewViewportForwardedPointerEvent {
  button: number
  buttons: number
  clientX: number
  clientY: number
  eventType: 'pointercancel' | 'pointerdown' | 'pointermove' | 'pointerup'
  pointerId: number
}

function clampMax(value: number, max: number): number {
  return Math.min(max, value)
}

function formatCssNumber(value: number): string {
  if (Math.abs(value) < 0.0001) {
    return '0'
  }

  return String(Number(value.toFixed(4)))
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  const element = target as { isContentEditable?: boolean, tagName?: string } | null
  const tagName = element?.tagName?.toLowerCase()

  return element?.isContentEditable === true
    || tagName === 'input'
    || tagName === 'select'
    || tagName === 'textarea'
}

function isZoomWheelEvent(event: WheelEvent): boolean {
  return event.ctrlKey || event.metaKey
}

export function usePreviewViewport(options: UsePreviewViewportOptions) {
  const maxZoom = options.maxZoom ?? DEFAULT_MAX_ZOOM
  const zoomStep = options.zoomStep ?? DEFAULT_ZOOM_STEP

  const fitZoom = shallowRef(1)
  const zoom = shallowRef(1)
  const panX = shallowRef(0)
  const panY = shallowRef(0)
  const isSpacePressed = shallowRef(false)
  const isPanning = shallowRef(false)
  let lastViewportSize: PreviewViewportSize | undefined

  const zoomRatio = computed(() => zoom.value / fitZoom.value)
  const viewportTransform = computed(() => {
    return `translate(${formatCssNumber(panX.value)}px, ${formatCssNumber(panY.value)}px) scale(${formatCssNumber(zoom.value)})`
  })

  function getViewportRect(): DOMRect | undefined {
    return options.getViewportElement()?.getBoundingClientRect()
  }

  function resolveViewportPoint(event: WheelEvent): PreviewViewportPoint {
    const target = event.currentTarget as HTMLElement | null
    const rect = target?.getBoundingClientRect() ?? getViewportRect()

    if (!rect) {
      return { x: 0, y: 0 }
    }

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  function resolveViewportCenter(): PreviewViewportPoint {
    const rect = getViewportRect()
    if (!rect) {
      return { x: 0, y: 0 }
    }

    return {
      x: rect.width / 2,
      y: rect.height / 2,
    }
  }

  function rememberViewportSize(rect: DOMRect): void {
    lastViewportSize = {
      height: rect.height,
      width: rect.width,
    }
  }

  function resolveCanvasPoint(point: PreviewViewportPoint, currentZoom: number): PreviewViewportPoint {
    return {
      x: (point.x - panX.value) / currentZoom,
      y: (point.y - panY.value) / currentZoom,
    }
  }

  function resolveViewportPointFromCanvas(point: PreviewViewportPoint, currentZoom: number): PreviewViewportPoint {
    return {
      x: panX.value + (point.x * currentZoom),
      y: panY.value + (point.y * currentZoom),
    }
  }

  function resolveClientPointFromCanvas(point: PreviewViewportPoint): PreviewViewportPoint {
    const viewportPoint = resolveViewportPointFromCanvas(point, zoom.value)
    const rect = getViewportRect()

    return {
      x: viewportPoint.x + (rect?.left ?? 0),
      y: viewportPoint.y + (rect?.top ?? 0),
    }
  }

  function createForwardedPointerEvent(event: PreviewViewportForwardedPointerEvent): ImmediatePointerDragEvent {
    const clientPoint = resolveClientPointFromCanvas({
      x: event.clientX,
      y: event.clientY,
    })

    return {
      altKey: false,
      button: event.button,
      buttons: event.buttons,
      clientX: clientPoint.x,
      clientY: clientPoint.y,
      pointerId: event.pointerId,
      shiftKey: false,
    }
  }

  function setZoomKeepingPoint(
    nextZoom: number,
    canvasPoint: PreviewViewportPoint,
    viewportPoint: PreviewViewportPoint,
  ): void {
    const clampedZoom = clampMax(nextZoom, maxZoom)
    if (clampedZoom === zoom.value) {
      return
    }

    zoom.value = clampedZoom
    panX.value = viewportPoint.x - (canvasPoint.x * clampedZoom)
    panY.value = viewportPoint.y - (canvasPoint.y * clampedZoom)
  }

  function setZoomAroundPoint(nextZoom: number, point: PreviewViewportPoint): void {
    const previousZoom = zoom.value
    setZoomKeepingPoint(nextZoom, resolveCanvasPoint(point, previousZoom), point)
  }

  function resolveWheelZoom(deltaY: number): number {
    const direction = deltaY < 0 ? zoomStep : 1 / zoomStep
    return zoom.value * direction
  }

  function zoomByWheelAtCanvasPoint(deltaY: number, point: PreviewViewportPoint): void {
    if (deltaY === 0) {
      return
    }

    const previousZoom = zoom.value
    setZoomKeepingPoint(
      resolveWheelZoom(deltaY),
      point,
      resolveViewportPointFromCanvas(point, previousZoom),
    )
  }

  function zoomIn(): void {
    setZoomAroundPoint(zoom.value * zoomStep, resolveViewportCenter())
  }

  function zoomOut(): void {
    setZoomAroundPoint(zoom.value / zoomStep, resolveViewportCenter())
  }

  function resolveFitToView(): {
    fitZoom: number
    rect: DOMRect
    canvasSize: PreviewViewportSize
  } | undefined {
    const rect = getViewportRect()
    const canvasSize = options.getCanvasSize()
    if (!rect || rect.width <= 0 || rect.height <= 0 || canvasSize.width <= 0 || canvasSize.height <= 0) {
      return
    }

    return {
      canvasSize,
      fitZoom: clampMax(Math.min(rect.width / canvasSize.width, rect.height / canvasSize.height), maxZoom),
      rect,
    }
  }

  function fitToView(): void {
    const fit = resolveFitToView()
    if (!fit) {
      return
    }

    fitZoom.value = fit.fitZoom
    zoom.value = fit.fitZoom
    panX.value = (fit.rect.width - (fit.canvasSize.width * fit.fitZoom)) / 2
    panY.value = (fit.rect.height - (fit.canvasSize.height * fit.fitZoom)) / 2
    rememberViewportSize(fit.rect)
  }

  function syncFitToViewport(): void {
    const fit = resolveFitToView()
    if (!fit) {
      return
    }

    if (!lastViewportSize) {
      fitToView()
      return
    }

    if (zoom.value <= 0 || fitZoom.value <= 0) {
      fitToView()
      return
    }

    const previousZoom = zoom.value
    const previousFitZoom = fitZoom.value
    const previousCenter = {
      x: lastViewportSize.width / 2,
      y: lastViewportSize.height / 2,
    }
    const nextCenter = {
      x: fit.rect.width / 2,
      y: fit.rect.height / 2,
    }
    const centerCanvasX = (previousCenter.x - panX.value) / previousZoom
    const centerCanvasY = (previousCenter.y - panY.value) / previousZoom
    const nextZoom = fit.fitZoom * (previousZoom / previousFitZoom)

    fitZoom.value = fit.fitZoom
    zoom.value = clampMax(nextZoom, maxZoom)
    panX.value = nextCenter.x - (centerCanvasX * zoom.value)
    panY.value = nextCenter.y - (centerCanvasY * zoom.value)
    rememberViewportSize(fit.rect)
  }

  function handleWheel(event: WheelEvent): void {
    if (event.deltaY === 0 || !isZoomWheelEvent(event)) {
      return
    }

    event.preventDefault()
    setZoomAroundPoint(resolveWheelZoom(event.deltaY), resolveViewportPoint(event))
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.code !== 'Space' || isEditableEventTarget(event.target)) {
      return
    }

    event.preventDefault()
    isSpacePressed.value = true
  }

  function handleKeyUp(event: KeyboardEvent): void {
    if (event.code !== 'Space') {
      return
    }

    isSpacePressed.value = false
  }

  function setSpacePressed(pressed: boolean): void {
    isSpacePressed.value = pressed
  }

  function handleWindowBlur(): void {
    isSpacePressed.value = false
  }

  const panDrag = useImmediatePointerDrag<{
    startPanX: number
    startPanY: number
    startX: number
    startY: number
  }>({
    onStart(event) {
      const isMiddleButton = event.button === 1
      const isSpaceLeftButton = event.button === 0 && isSpacePressed.value
      if (!isMiddleButton && !isSpaceLeftButton) {
        return
      }

      isPanning.value = true
      return {
        startPanX: panX.value,
        startPanY: panY.value,
        startX: event.clientX,
        startY: event.clientY,
      }
    },
    onMove(event, state) {
      panX.value = state.startPanX + event.clientX - state.startX
      panY.value = state.startPanY + event.clientY - state.startY
    },
    onEnd() {
      isPanning.value = false
    },
  })

  function handlePointerDown(event: PointerEvent): void {
    if (!panDrag.start(event)) {
      return
    }

    event.preventDefault()
  }

  function handleForwardedPointerEvent(event: PreviewViewportForwardedPointerEvent): void {
    const pointerEvent = createForwardedPointerEvent(event)

    if (event.eventType === 'pointerdown') {
      panDrag.start(pointerEvent)
      return
    }

    if (event.eventType === 'pointermove') {
      panDrag.move(pointerEvent)
      return
    }

    panDrag.end(pointerEvent)
  }

  useEventListener(globalThis, 'keydown', handleKeyDown)
  useEventListener(globalThis, 'keyup', handleKeyUp)
  useEventListener(globalThis, 'blur', handleWindowBlur)

  return {
    fitToView,
    handleForwardedPointerEvent,
    handlePointerDown,
    handleWheel,
    isPanning,
    isSpacePressed,
    setSpacePressed,
    syncFitToViewport,
    viewportTransform,
    zoom,
    zoomByWheelAtCanvasPoint,
    zoomRatio,
    zoomIn,
    zoomOut,
  }
}
