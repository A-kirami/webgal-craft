import type { DisplayTransform } from './model'
import type { ReferenceBox } from '~/types/editorPreviewProtocol'

export type TransformScaleHandle = 'n' | 'e' | 's' | 'w' | 'nw' | 'ne' | 'se' | 'sw'
export type TransformRotateHandle = Extract<TransformScaleHandle, 'nw' | 'ne' | 'se' | 'sw'>

export interface StagePoint {
  x: number
  y: number
}

export interface StageSize {
  height: number
  width: number
}

export interface TransformFrame {
  anchorX: number
  anchorY: number
  height: number
  left: number
  originX: number
  originY: number
  rotation: number
  scaleX: number
  scaleY: number
  top: number
  width: number
}

export interface SizeLabelPlacement extends StagePoint {
  rotation: number
}

interface ComputeTransformFrameOptions {
  box: ReferenceBox
  canvasSize: StageSize
  transform: DisplayTransform
}

interface ApplyMoveOptions {
  delta: StagePoint
  startTransform: DisplayTransform
}

interface ApplyRotateOptions {
  baseTransform: DisplayTransform
  center: StagePoint
  currentPointer: StagePoint
  previousPointer: StagePoint
  rawRotation: number
  shiftKey: boolean
}

interface ApplyRotateResult {
  rawRotation: number
  transform: DisplayTransform
}

interface ApplyScaleOptions {
  box: ReferenceBox
  handle: TransformScaleHandle
  keepRatio: boolean
  pointerDelta: StagePoint
  startTransform: DisplayTransform
}

const ROTATION_SNAP_RADIAN = Math.PI / 12
const HALF_TURN_RADIAN = Math.PI
const FULL_TURN_RADIAN = Math.PI * 2
const RESIZE_CURSOR_STEP_RADIAN = Math.PI / 4
const QUARTER_TURN_RADIAN = Math.PI / 2
const RESIZE_CURSOR_HOTSPOT = 16
const RESIZE_CURSOR_CACHE_LIMIT = 64
const CURSOR_CACHE_KEY_DECIMAL_PLACES = 6
const ROTATE_CURSOR_HOTSPOT = 16
const RESIZE_CURSOR_SNAP_DEGREE = 5
const ROTATE_CURSOR_STEP_DEGREE = 5
const ROTATE_CURSOR_CACHE_LIMIT = 360 / ROTATE_CURSOR_STEP_DEGREE
export const TRANSFORM_OVERLAY_DEFAULT_CURSOR = 'url("data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2033%2032%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2233%22%20height%3D%2232%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M0%200h33v32H0z%22%2F%3E%3Cpath%20d%3D%22m6.364%202.771%2010.24%209.882c.995.96.268%202.798-1.102%202.987-1.452.2-3.118.563-4.66%201.218-1.541.654-2.96%201.6-4.112%202.505-1.088.854-2.916.1-2.915-1.282L3.823%203.85c0-1.323%201.59-1.997%202.541-1.079%22%20fill%3D%22%23000%22%20fill-rule%3D%22evenodd%22%2F%3E%3Cpath%20d%3D%22m7.059%202.052%2010.24%209.882q.29.279.47.616.194.36.263.788.037.232.035.463-.005.496-.192.99-.154.406-.405.74-.185.245-.42.451-.357.311-.772.48-.304.122-.64.169-2.518.347-4.405%201.147-1.886.8-3.886%202.371-.266.21-.566.343-.409.181-.88.222-.313.026-.617-.011-.414-.052-.814-.224-.485-.208-.845-.549-.168-.159-.308-.347-.26-.347-.385-.737-.117-.364-.117-.766l.008-14.23q0-.45.142-.847.109-.306.301-.581.187-.268.428-.473.288-.245.652-.4.365-.154.74-.191.315-.03.638.02.332.054.627.188.385.174.708.486m9.546%2010.601L6.365%202.771c-.953-.918-2.542-.244-2.542%201.079l-.008%2014.23c0%201.383%201.827%202.137%202.915%201.283%201.152-.905%202.57-1.85%204.113-2.505%201.541-.655%203.207-1.018%204.659-1.218%201.37-.189%202.097-2.027%201.103-2.987%22%20fill%3D%22%23fff%22%20fill-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E") 4 4, default'

const RESIZE_HANDLE_ANGLES: Record<TransformScaleHandle, number> = {
  e: 0,
  se: Math.PI / 4,
  s: Math.PI / 2,
  sw: (Math.PI * 3) / 4,
  w: Math.PI,
  nw: (-Math.PI * 3) / 4,
  n: -Math.PI / 2,
  ne: -Math.PI / 4,
}

const ROTATE_HANDLE_ANGLES: Record<TransformRotateHandle, number> = {
  se: 0,
  sw: Math.PI / 2,
  nw: Math.PI,
  ne: (Math.PI * 3) / 2,
}

const RESIZE_CURSOR_FALLBACKS = [
  'ew-resize',
  'nwse-resize',
  'ns-resize',
  'nesw-resize',
] as const

interface ResizeCursorSegment {
  innerStrokeWidth: number
  outerStrokeWidth: number
  x1: number
  x2: number
  y1: number
  y2: number
}

const RESIZE_CURSOR_CENTER = {
  x: 16,
  y: 16,
}
const RESIZE_CURSOR_CENTER_LINE: ResizeCursorSegment = {
  innerStrokeWidth: 1.5,
  outerStrokeWidth: 3,
  x1: 7,
  x2: 25,
  y1: 15.5,
  y2: 15.5,
}
const RESIZE_CURSOR_ARROW_SEGMENTS: ResizeCursorSegment[] = [
  {
    innerStrokeWidth: 2,
    outerStrokeWidth: 4,
    x1: 22,
    x2: 25.536,
    y1: 12,
    y2: 15.536,
  },
  {
    innerStrokeWidth: 2,
    outerStrokeWidth: 4,
    x1: 22,
    x2: 25.536,
    y1: 19.071,
    y2: 15.535,
  },
  {
    innerStrokeWidth: 2,
    outerStrokeWidth: 4,
    x1: 10,
    x2: 6.464,
    y1: 12,
    y2: 15.536,
  },
  {
    innerStrokeWidth: 2,
    outerStrokeWidth: 4,
    x1: 10,
    x2: 6.464,
    y1: 19.071,
    y2: 15.535,
  },
]

const TRANSFORM_DECIMAL_PLACES = 2
const resizeCursorCache = new Map<string, string>()
const rotateCursorCache = new Map<string, string>()

function roundToDecimalPlaces(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces
  return Math.round(value * factor) / factor
}

function roundTransformValue(value: number): number {
  return roundToDecimalPlaces(value, TRANSFORM_DECIMAL_PLACES)
}

function normalizeScale(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }

  return value
}

function rotatePoint(point: StagePoint, rotation: number): StagePoint {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  return {
    x: (point.x * cos) - (point.y * sin),
    y: (point.x * sin) + (point.y * cos),
  }
}

function inverseRotatePoint(point: StagePoint, rotation: number): StagePoint {
  return rotatePoint(point, -rotation)
}

function midpoint(a: StagePoint, b: StagePoint): StagePoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

function normalizeReadableRotation(rotation: number): number {
  return Math.atan2(Math.sin(rotation), Math.cos(rotation))
}

function normalizeRadianDelta(delta: number): number {
  let normalized = delta % FULL_TURN_RADIAN
  if (normalized > HALF_TURN_RADIAN) {
    normalized -= FULL_TURN_RADIAN
  }
  if (normalized < -HALF_TURN_RADIAN) {
    normalized += FULL_TURN_RADIAN
  }

  return normalized
}

function normalizeLabelRotation(rotation: number): number {
  const normalized = normalizeReadableRotation(rotation)
  if (normalized > QUARTER_TURN_RADIAN) {
    return normalized - Math.PI
  }
  if (normalized < -QUARTER_TURN_RADIAN) {
    return normalized + Math.PI
  }

  return normalized
}

function offsetPoint(point: StagePoint, rotation: number, distance: number): StagePoint {
  return {
    x: point.x - (Math.sin(rotation) * distance),
    y: point.y + (Math.cos(rotation) * distance),
  }
}

function chooseSizeLabelEdge(edges: (StagePoint & { rotation: number })[]): StagePoint & { rotation: number } {
  let selected = edges[0]

  for (const edge of edges.slice(1)) {
    if (edge.y > selected.y || (edge.y === selected.y && edge.x > selected.x)) {
      selected = edge
    }
  }

  return selected
}

export function resolveRotatedCorners(frame: TransformFrame): Record<TransformScaleHandle, StagePoint> {
  const origin = {
    x: frame.width * frame.anchorX,
    y: frame.height * frame.anchorY,
  }
  const corners = [
    { x: 0, y: 0 },
    { x: frame.width, y: 0 },
    { x: frame.width, y: frame.height },
    { x: 0, y: frame.height },
  ].map((point) => {
    const rotated = rotatePoint({
      x: point.x - origin.x,
      y: point.y - origin.y,
    }, frame.rotation)

    return {
      x: frame.left + origin.x + rotated.x,
      y: frame.top + origin.y + rotated.y,
    }
  })

  return {
    nw: corners[0],
    n: midpoint(corners[0], corners[1]),
    ne: corners[1],
    e: midpoint(corners[1], corners[2]),
    se: corners[2],
    s: midpoint(corners[2], corners[3]),
    sw: corners[3],
    w: midpoint(corners[3], corners[0]),
  }
}

export function resolveSizeLabelPlacement(frame: TransformFrame, gap: number): SizeLabelPlacement {
  const corners = resolveRotatedCorners(frame)
  const readableFrameRotation = normalizeReadableRotation(frame.rotation)
  const useHorizontalEdges = Math.abs(readableFrameRotation) <= Math.PI / 4
    || Math.abs(readableFrameRotation) >= (Math.PI * 3) / 4
  const horizontalEdgeRotation = normalizeLabelRotation(frame.rotation)
  const edge = useHorizontalEdges
    ? chooseSizeLabelEdge([
        { ...corners.n, rotation: horizontalEdgeRotation },
        { ...corners.s, rotation: horizontalEdgeRotation },
      ])
    : chooseSizeLabelEdge([
        { ...corners.e, rotation: normalizeLabelRotation(frame.rotation - QUARTER_TURN_RADIAN) },
        { ...corners.w, rotation: normalizeLabelRotation(frame.rotation + QUARTER_TURN_RADIAN) },
      ])
  const point = offsetPoint(edge, edge.rotation, gap)

  return {
    ...point,
    rotation: edge.rotation,
  }
}

function createDisplayTransform(
  source: DisplayTransform,
  patch: Partial<DisplayTransform>,
): DisplayTransform {
  return {
    position: {
      x: patch.position ? roundTransformValue(patch.position.x) : source.position.x,
      y: patch.position ? roundTransformValue(patch.position.y) : source.position.y,
    },
    scale: {
      x: patch.scale ? roundTransformValue(patch.scale.x) : source.scale.x,
      y: patch.scale ? roundTransformValue(patch.scale.y) : source.scale.y,
    },
    rotation: patch.rotation ?? source.rotation,
  }
}

function getScaleHandleSign(handle: TransformScaleHandle): StagePoint {
  let x = 0
  let y = 0
  if (handle.includes('w')) {
    x = -1
  } else if (handle.includes('e')) {
    x = 1
  }
  if (handle.includes('n')) {
    y = -1
  } else if (handle.includes('s')) {
    y = 1
  }

  return {
    x,
    y,
  }
}

function resolveOriginForScale(
  box: ReferenceBox,
  scale: { x: number, y: number },
  sign: StagePoint,
): StagePoint {
  const left = -box.width * box.anchorX * scale.x
  const right = box.width * (1 - box.anchorX) * scale.x
  const top = -box.height * box.anchorY * scale.y
  const bottom = box.height * (1 - box.anchorY) * scale.y
  let x = 0
  let y = 0
  if (sign.x < 0) {
    x = right
  } else if (sign.x > 0) {
    x = left
  }
  if (sign.y < 0) {
    y = bottom
  } else if (sign.y > 0) {
    y = top
  }

  return {
    x,
    y,
  }
}

function resolvePointerScaleRatio(
  box: ReferenceBox,
  handle: TransformScaleHandle,
  pointerDelta: StagePoint,
  startTransform: DisplayTransform,
): { x: number, y: number } {
  const sign = getScaleHandleSign(handle)
  const localDelta = inverseRotatePoint(pointerDelta, startTransform.rotation)
  const startWidth = box.width * startTransform.scale.x
  const startHeight = box.height * startTransform.scale.y

  return {
    x: sign.x === 0 ? 1 : normalizeScale((startWidth + (localDelta.x * sign.x)) / startWidth),
    y: sign.y === 0 ? 1 : normalizeScale((startHeight + (localDelta.y * sign.y)) / startHeight),
  }
}

function resolveKeptRatio(
  box: ReferenceBox,
  handle: TransformScaleHandle,
  ratio: { x: number, y: number },
  pointerDelta: StagePoint,
  startTransform: DisplayTransform,
): { x: number, y: number } {
  if (!handle.includes('n') && !handle.includes('s')) {
    return { x: ratio.x, y: ratio.x }
  }
  if (!handle.includes('e') && !handle.includes('w')) {
    return { x: ratio.y, y: ratio.y }
  }

  const sign = getScaleHandleSign(handle)
  const localDelta = inverseRotatePoint(pointerDelta, startTransform.rotation)
  const diagonal = {
    x: box.width * startTransform.scale.x * sign.x,
    y: box.height * startTransform.scale.y * sign.y,
  }
  const diagonalLengthSquared = (diagonal.x * diagonal.x) + (diagonal.y * diagonal.y)
  if (diagonalLengthSquared === 0) {
    return { x: 1, y: 1 }
  }

  const projectedRatio = normalizeScale(
    1 + (((localDelta.x * diagonal.x) + (localDelta.y * diagonal.y)) / diagonalLengthSquared),
  )

  return {
    x: projectedRatio,
    y: projectedRatio,
  }
}

export function computeTransformFrame(options: ComputeTransformFrameOptions): TransformFrame {
  const { box, canvasSize, transform } = options
  const scaleX = canvasSize.width / box.stageWidth
  const scaleY = canvasSize.height / box.stageHeight
  const currentOriginX = box.originX + transform.position.x
  const currentOriginY = box.originY + transform.position.y
  const currentWidth = box.width * transform.scale.x
  const currentHeight = box.height * transform.scale.y
  const frameAnchorX = currentWidth < 0 ? 1 - box.anchorX : box.anchorX
  const frameAnchorY = currentHeight < 0 ? 1 - box.anchorY : box.anchorY
  const frameWidth = Math.abs(currentWidth)
  const frameHeight = Math.abs(currentHeight)

  return {
    anchorX: frameAnchorX,
    anchorY: frameAnchorY,
    height: frameHeight * scaleY,
    left: (currentOriginX - (frameWidth * frameAnchorX)) * scaleX,
    originX: currentOriginX * scaleX,
    originY: currentOriginY * scaleY,
    rotation: transform.rotation,
    scaleX,
    scaleY,
    top: (currentOriginY - (frameHeight * frameAnchorY)) * scaleY,
    width: frameWidth * scaleX,
  }
}

export function applyMove(options: ApplyMoveOptions): DisplayTransform {
  return createDisplayTransform(options.startTransform, {
    position: {
      x: options.startTransform.position.x + options.delta.x,
      y: options.startTransform.position.y + options.delta.y,
    },
  })
}

export function applyRotate(options: ApplyRotateOptions): ApplyRotateResult {
  const previousAngle = Math.atan2(
    options.previousPointer.y - options.center.y,
    options.previousPointer.x - options.center.x,
  )
  const currentAngle = Math.atan2(
    options.currentPointer.y - options.center.y,
    options.currentPointer.x - options.center.x,
  )
  const rawRotation = options.rawRotation + normalizeRadianDelta(currentAngle - previousAngle)
  const rotation = options.shiftKey
    ? Math.round(rawRotation / ROTATION_SNAP_RADIAN) * ROTATION_SNAP_RADIAN
    : rawRotation

  return {
    rawRotation,
    transform: createDisplayTransform(options.baseTransform, { rotation }),
  }
}

export function applyScale(options: ApplyScaleOptions): DisplayTransform {
  const sign = getScaleHandleSign(options.handle)
  const ratio = resolvePointerScaleRatio(
    options.box,
    options.handle,
    options.pointerDelta,
    options.startTransform,
  )
  const finalRatio = options.keepRatio
    ? resolveKeptRatio(options.box, options.handle, ratio, options.pointerDelta, options.startTransform)
    : ratio
  const nextScale = {
    x: roundTransformValue(normalizeScale(options.startTransform.scale.x * finalRatio.x)),
    y: roundTransformValue(normalizeScale(options.startTransform.scale.y * finalRatio.y)),
  }
  const fixedLocalBefore = resolveOriginForScale(options.box, options.startTransform.scale, sign)
  const fixedLocalAfter = resolveOriginForScale(options.box, nextScale, sign)
  const compensation = rotatePoint({
    x: fixedLocalBefore.x - fixedLocalAfter.x,
    y: fixedLocalBefore.y - fixedLocalAfter.y,
  }, options.startTransform.rotation)

  return createDisplayTransform(options.startTransform, {
    position: {
      x: options.startTransform.position.x + compensation.x,
      y: options.startTransform.position.y + compensation.y,
    },
    scale: nextScale,
  })
}

export function canvasPointToStagePoint(
  point: StagePoint,
  frame: Pick<TransformFrame, 'scaleX' | 'scaleY'>,
): StagePoint {
  return {
    x: point.x / frame.scaleX,
    y: point.y / frame.scaleY,
  }
}

function formatCursorNumber(value: number): string {
  const rounded = roundToDecimalPlaces(value, 3)
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function formatCursorCacheKey(value: number): string {
  const rounded = roundToDecimalPlaces(value, CURSOR_CACHE_KEY_DECIMAL_PLACES)
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function normalizeResizeCursorDirection(direction: number): number {
  let normalized = direction % HALF_TURN_RADIAN
  if (normalized < 0) {
    normalized += HALF_TURN_RADIAN
  }
  if (normalized > QUARTER_TURN_RADIAN) {
    normalized -= HALF_TURN_RADIAN
  }

  return normalized
}

function snapResizeCursorDirection(direction: number): number {
  const degree = (direction * 180) / Math.PI
  const snappedDegree = Math.round(degree / RESIZE_CURSOR_SNAP_DEGREE) * RESIZE_CURSOR_SNAP_DEGREE
  const snappedDirection = (snappedDegree * Math.PI) / 180

  return Object.is(snappedDirection, -0) ? 0 : snappedDirection
}

function resolveResizeCursorFallback(direction: number): typeof RESIZE_CURSOR_FALLBACKS[number] {
  const cursorIndex = Math.round(direction / RESIZE_CURSOR_STEP_RADIAN)
  const fallbackIndex = cursorIndex < 0
    ? RESIZE_CURSOR_FALLBACKS.length + cursorIndex
    : cursorIndex

  return RESIZE_CURSOR_FALLBACKS[fallbackIndex]
}

function rotateCursorPoint(point: StagePoint, direction: number): StagePoint {
  const rotated = rotatePoint({
    x: point.x - RESIZE_CURSOR_CENTER.x,
    y: point.y - RESIZE_CURSOR_CENTER.y,
  }, direction)

  return {
    x: RESIZE_CURSOR_CENTER.x + rotated.x,
    y: RESIZE_CURSOR_CENTER.y + rotated.y,
  }
}

function rotateCursorSegment(segment: ResizeCursorSegment, direction: number): ResizeCursorSegment {
  const start = rotateCursorPoint({ x: segment.x1, y: segment.y1 }, direction)
  const end = rotateCursorPoint({ x: segment.x2, y: segment.y2 }, direction)

  return {
    ...segment,
    x1: start.x,
    x2: end.x,
    y1: start.y,
    y2: end.y,
  }
}

function createResizeCursorLine(segment: ResizeCursorSegment, strokeWidth: number): string {
  const x1 = formatCursorNumber(segment.x1)
  const x2 = formatCursorNumber(segment.x2)
  const y1 = formatCursorNumber(segment.y1)
  const y2 = formatCursorNumber(segment.y2)

  return `<line x1="${x1}" x2="${x2}" y1="${y1}" y2="${y2}" stroke-width="${strokeWidth}" />`
}

function createResizeCursorLines(
  segments: ResizeCursorSegment[],
  stroke: string,
  strokeWidth: 'innerStrokeWidth' | 'outerStrokeWidth',
): string {
  const lines = segments
    .map(segment => createResizeCursorLine(segment, segment[strokeWidth]))
    .join('')

  return `<g stroke="${stroke}" stroke-linecap="round">${lines}</g>`
}

function createResizeCursorSvg(direction: number): string {
  const rotatedSegments = [
    rotateCursorSegment(RESIZE_CURSOR_CENTER_LINE, direction),
    ...RESIZE_CURSOR_ARROW_SEGMENTS.map(segment => rotateCursorSegment(segment, direction)),
  ]

  return [
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none">',
    '<rect width="32" height="32" />',
    createResizeCursorLines(rotatedSegments, 'rgb(255,255,255)', 'outerStrokeWidth'),
    createResizeCursorLines(rotatedSegments, 'rgb(0,0,0)', 'innerStrokeWidth'),
    '</svg>',
  ].join('')
}

function createResizeCursor(direction: number): string {
  const normalizedDirection = normalizeResizeCursorDirection(direction)
  const snappedDirection = snapResizeCursorDirection(normalizedDirection)
  const cacheKey = formatCursorCacheKey(snappedDirection)
  const cachedCursor = resizeCursorCache.get(cacheKey)
  if (cachedCursor) {
    return cachedCursor
  }

  const svg = createResizeCursorSvg(snappedDirection)
  const encodedSvg = encodeURIComponent(svg)
  const cursor = `url("data:image/svg+xml,${encodedSvg}") ${RESIZE_CURSOR_HOTSPOT} ${RESIZE_CURSOR_HOTSPOT}, ${resolveResizeCursorFallback(snappedDirection)}`

  if (resizeCursorCache.size >= RESIZE_CURSOR_CACHE_LIMIT) {
    const oldestKey = resizeCursorCache.keys().next().value
    if (oldestKey !== undefined) {
      resizeCursorCache.delete(oldestKey)
    }
  }
  resizeCursorCache.set(cacheKey, cursor)

  return cursor
}

function normalizeRotateCursorDegree(direction: number): number {
  const rawDegree = (direction * 180) / Math.PI
  const normalized = ((rawDegree % 360) + 360) % 360
  const rounded = Math.round(normalized / ROTATE_CURSOR_STEP_DEGREE) * ROTATE_CURSOR_STEP_DEGREE

  if (Object.is(rounded, -0) || rounded === 360) {
    return 0
  }

  return rounded
}

function createRotateCursorSvg(directionDegree: number): string {
  const formattedDirectionDegree = formatCursorNumber(directionDegree)

  return [
    '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none">',
    '<rect width="32" height="32" />',
    `<g transform="rotate(${formattedDirectionDegree} 16 16)">`,
    '<g stroke="rgb(255,255,255)" stroke-linecap="round">',
    '<path d="M0 0L5 0" stroke-width="4" transform="matrix(0.707107,-0.707107,0.707107,0.707107,17.47,10)" />',
    '<path d="M0 0L5 0" stroke-width="4" transform="matrix(-0.707107,-0.707107,0.707107,-0.707107,24.54,10)" />',
    '<path d="M0 0L5 0" stroke-width="4" transform="matrix(-0.707107,0.707107,-0.707107,-0.707107,11,16.9999)" />',
    '<path d="M0 0L5 0" stroke-width="4" transform="matrix(-0.707107,-0.707107,0.707107,-0.707107,11,24.071)" />',
    '<path d="M21 7.5L21 10.9931C21 10.9931 21 15 18.65 17.5C16.3 20 14.1718 20.313 11.9985 20.5C10 20.5 8.5 20.5 8.5 20.5" stroke-width="3" />',
    '</g>',
    '<g stroke="rgb(0,0,0)" stroke-linecap="round">',
    '<path d="M0 0L5 0" stroke-width="2" transform="matrix(0.707107,-0.707107,0.707107,0.707107,17.47,10)" />',
    '<path d="M0 0L5 0" stroke-width="2" transform="matrix(-0.707107,-0.707107,0.707107,-0.707107,24.54,10)" />',
    '<path d="M0 0L5 0" stroke-width="2" transform="matrix(-0.707107,0.707107,-0.707107,-0.707107,11,16.9999)" />',
    '<path d="M0 0L5 0" stroke-width="2" transform="matrix(-0.707107,-0.707107,0.707107,-0.707107,11,24.071)" />',
    '<path d="M21 7.5L21 10.9931C21 10.9931 21 15 18.65 17.5C16.3 20 14.1718 20.313 11.9985 20.5C10 20.5 8.5 20.5 8.5 20.5" stroke-width="1.5" />',
    '</g>',
    '</g>',
    '</svg>',
  ].join('')
}

function createRotateCursor(direction: number): string {
  const normalizedDegree = normalizeRotateCursorDegree(direction)
  const cacheKey = formatCursorCacheKey(normalizedDegree)
  const cachedCursor = rotateCursorCache.get(cacheKey)
  if (cachedCursor) {
    return cachedCursor
  }

  const svg = createRotateCursorSvg(normalizedDegree)
  const encodedSvg = encodeURIComponent(svg)
  const cursor = `url("data:image/svg+xml,${encodedSvg}") ${ROTATE_CURSOR_HOTSPOT} ${ROTATE_CURSOR_HOTSPOT}, grab`

  if (rotateCursorCache.size >= ROTATE_CURSOR_CACHE_LIMIT) {
    const oldestKey = rotateCursorCache.keys().next().value
    if (oldestKey !== undefined) {
      rotateCursorCache.delete(oldestKey)
    }
  }
  rotateCursorCache.set(cacheKey, cursor)

  return cursor
}

export function resolveResizeCursor(handle: TransformScaleHandle, rotation: number): string {
  const direction = RESIZE_HANDLE_ANGLES[handle] + rotation

  return createResizeCursor(direction)
}

export function resolveRotateCursor(handle: TransformRotateHandle, rotation: number): string {
  const direction = ROTATE_HANDLE_ANGLES[handle] + rotation

  return createRotateCursor(direction)
}
