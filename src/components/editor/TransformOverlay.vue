<script setup lang="ts">
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import {
  computeTransformFrame,
  resolveResizeCursor,
  resolveRotateCursor,
  resolveRotatedCorners,
  resolveSizeLabelPlacement,
  TRANSFORM_OVERLAY_DEFAULT_CURSOR,
} from '~/features/editor/transform-overlay/geometry'
import {
  resolveRotateTooltipFromEvent,
  useTransformControl,
} from '~/features/editor/transform-overlay/useTransformControl'

import type { CSSProperties } from 'vue'
import type { TransformFrame, TransformRotateHandle, TransformScaleHandle } from '~/features/editor/transform-overlay/geometry'
import type { DisplayTransform } from '~/features/editor/transform-overlay/model'
import type {
  TransformControlHandle,
  TransformRotateTooltip,
} from '~/features/editor/transform-overlay/useTransformControl'
import type { ReferenceBox } from '~/types/editorPreviewProtocol'

interface Props {
  box?: ReferenceBox
  canvasPlacement: {
    left: number
    scale: number
    top: number
  }
  canvasHeight: number
  canvasWidth: number
  displayTransform?: DisplayTransform
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'cancel:displayTransform': []
  'commit:displayTransform': [value: DisplayTransform]
  'preview:displayTransform': [value: DisplayTransform]
}>()

const cornerHandles: TransformRotateHandle[] = ['nw', 'ne', 'se', 'sw']
const edgeHandles: TransformScaleHandle[] = ['n', 'e', 's', 'w']
const rotateHandles = cornerHandles
const KEYBOARD_MOVE_STEP = 1
const KEYBOARD_FAST_MOVE_STEP = 10
const FRAME_STROKE_WIDTH = 2
const CORNER_HANDLE_STROKE_CENTER_OFFSET = `${FRAME_STROKE_WIDTH / 2}px`
const CORNER_HANDLE_OPPOSITE_STROKE_CENTER_OFFSET = `calc(100% - ${CORNER_HANDLE_STROKE_CENTER_OFFSET})`
const SIZE_LABEL_EDGE_GAP = 6
const ROTATE_HANDLE_VISUAL_SIZE = 6
const ROTATE_HANDLE_HIT_OUTSET = 10
const ROTATE_HANDLE_HIT_SIZE = ROTATE_HANDLE_VISUAL_SIZE + (ROTATE_HANDLE_HIT_OUTSET * 2)
const ROTATE_HANDLE_GAP = 0
const scaleHandlePlacementStyles: Record<TransformScaleHandle, CSSProperties> = {
  e: {
    top: '50%',
    left: '100%',
    width: '8px',
    height: 'calc(100% - 16px)',
    transform: 'translate(-50%, -50%)',
  },
  n: {
    top: '0',
    left: '50%',
    width: 'calc(100% - 16px)',
    height: '8px',
    transform: 'translate(-50%, -50%)',
  },
  ne: {
    top: CORNER_HANDLE_STROKE_CENTER_OFFSET,
    left: CORNER_HANDLE_OPPOSITE_STROKE_CENTER_OFFSET,
  },
  nw: {
    top: CORNER_HANDLE_STROKE_CENTER_OFFSET,
    left: CORNER_HANDLE_STROKE_CENTER_OFFSET,
  },
  s: {
    top: '100%',
    left: '50%',
    width: 'calc(100% - 16px)',
    height: '8px',
    transform: 'translate(-50%, -50%)',
  },
  se: {
    top: CORNER_HANDLE_OPPOSITE_STROKE_CENTER_OFFSET,
    left: CORNER_HANDLE_OPPOSITE_STROKE_CENTER_OFFSET,
  },
  sw: {
    top: CORNER_HANDLE_OPPOSITE_STROKE_CENTER_OFFSET,
    left: CORNER_HANDLE_STROKE_CENTER_OFFSET,
  },
  w: {
    top: '50%',
    left: '0',
    width: '8px',
    height: 'calc(100% - 16px)',
    transform: 'translate(-50%, -50%)',
  },
}
let rotateTooltip = $ref<TransformRotateTooltip>()

const canvasFrame = $computed<TransformFrame | undefined>(() => {
  if (!props.box || !props.displayTransform) {
    return
  }

  return computeTransformFrame({
    box: props.box,
    canvasSize: {
      height: props.canvasHeight,
      width: props.canvasWidth,
    },
    transform: props.displayTransform,
  })
})

const viewportFrame = $computed<TransformFrame | undefined>(() => {
  if (!canvasFrame) {
    return
  }

  return projectFrameToViewport(canvasFrame, props.canvasPlacement)
})

const visualViewportFrame = $computed<TransformFrame | undefined>(() => {
  if (!viewportFrame) {
    return
  }

  return snapFrameToDevicePixels(viewportFrame)
})

const frameStyle = $computed(() => {
  if (!visualViewportFrame) {
    return
  }

  return {
    height: `${visualViewportFrame.height}px`,
    left: `${visualViewportFrame.left}px`,
    top: `${visualViewportFrame.top}px`,
    transform: `rotate(${visualViewportFrame.rotation}rad)`,
    transformOrigin: `${visualViewportFrame.anchorX * 100}% ${visualViewportFrame.anchorY * 100}%`,
    width: `${visualViewportFrame.width}px`,
  }
})

const sizeLabelStyle = $computed(() => {
  if (!visualViewportFrame) {
    return
  }

  const placement = resolveSizeLabelPlacement(visualViewportFrame, SIZE_LABEL_EDGE_GAP)
  return {
    left: `${snapToDevicePixel(placement.x)}px`,
    top: `${snapToDevicePixel(placement.y)}px`,
    transform: `rotate(${placement.rotation}rad)`,
  }
})

const sizeLabel = $computed(() => {
  if (!canvasFrame) {
    return ''
  }

  return `${Math.round(canvasFrame.width)} x ${Math.round(canvasFrame.height)}`
})

const rotateHandleStyles = $computed(() => {
  if (!visualViewportFrame) {
    return {} as Partial<Record<TransformRotateHandle, CSSProperties>>
  }

  const positions = resolveRotatedCorners(visualViewportFrame)
  return {
    nw: resolveRotateHandleStyle(positions.nw, { x: -1, y: -1 }, visualViewportFrame.rotation),
    ne: resolveRotateHandleStyle(positions.ne, { x: 1, y: -1 }, visualViewportFrame.rotation),
    se: resolveRotateHandleStyle(positions.se, { x: 1, y: 1 }, visualViewportFrame.rotation),
    sw: resolveRotateHandleStyle(positions.sw, { x: -1, y: 1 }, visualViewportFrame.rotation),
  } as Partial<Record<TransformRotateHandle, CSSProperties>>
})

function getRotateHandleStyle(handle: TransformRotateHandle): CSSProperties {
  return {
    ...rotateHandleStyles[handle],
    cursor: visualViewportFrame === undefined
      ? TRANSFORM_OVERLAY_DEFAULT_CURSOR
      : resolveRotateCursor(handle, visualViewportFrame.rotation),
  }
}

function resolveScaleCursor(handle: TransformScaleHandle): string {
  if (control.activeHandle === 'rotate') {
    return 'default'
  }

  const rotation = props.displayTransform?.rotation
  if (rotation === undefined) {
    return TRANSFORM_OVERLAY_DEFAULT_CURSOR
  }

  return resolveResizeCursor(handle, rotation)
}

function rotateOffset(offset: { x: number, y: number }, rotation: number): { x: number, y: number } {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  return {
    x: (offset.x * cos) - (offset.y * sin),
    y: (offset.x * sin) + (offset.y * cos),
  }
}

function resolveRotateHandleStyle(
  corner: { x: number, y: number },
  direction: { x: number, y: number },
  rotation: number,
): CSSProperties {
  const distance = ROTATE_HANDLE_GAP + (ROTATE_HANDLE_VISUAL_SIZE / 2)
  const offset = rotateOffset({
    x: direction.x * distance,
    y: direction.y * distance,
  }, rotation)

  return {
    left: `${corner.x + offset.x - (ROTATE_HANDLE_HIT_SIZE / 2)}px`,
    top: `${corner.y + offset.y - (ROTATE_HANDLE_HIT_SIZE / 2)}px`,
    transform: `rotate(${rotation}rad)`,
    width: `${ROTATE_HANDLE_HIT_SIZE}px`,
    height: `${ROTATE_HANDLE_HIT_SIZE}px`,
  }
}

const control = useTransformControl({
  getBox: () => props.box,
  getCanvasPlacement: () => props.canvasPlacement,
  getFrame: () => canvasFrame,
  getTransform: () => props.displayTransform!,
  onCancel() {
    emitCancelDisplayTransform()
  },
  onChange(transform, options) {
    emitDisplayTransform(transform, options?.flush === true ? 'commit' : 'preview')
  },
  onRotateTooltipChange(tooltip) {
    rotateTooltip = tooltip
  },
})

const scaleHandleStyles = $computed<Record<TransformScaleHandle, CSSProperties>>(() => ({
  e: resolveScaleHandleStyle('e'),
  n: resolveScaleHandleStyle('n'),
  ne: resolveScaleHandleStyle('ne'),
  nw: resolveScaleHandleStyle('nw'),
  s: resolveScaleHandleStyle('s'),
  se: resolveScaleHandleStyle('se'),
  sw: resolveScaleHandleStyle('sw'),
  w: resolveScaleHandleStyle('w'),
}))

useShortcutContext({
  panelFocus: 'transformOverlay',
}, {
  trackFocus: true,
})

function resolveScaleHandleStyle(handle: TransformScaleHandle): CSSProperties {
  return {
    ...scaleHandlePlacementStyles[handle],
    cursor: resolveScaleCursor(handle),
  }
}

function snapToDevicePixel(value: number): number {
  const ratio = globalThis.devicePixelRatio || 1

  return Math.round(value * ratio) / ratio
}

function snapFrameToDevicePixels(frame: TransformFrame): TransformFrame {
  const ratio = globalThis.devicePixelRatio || 1
  const left = Math.floor(frame.left * ratio) / ratio
  const top = Math.floor(frame.top * ratio) / ratio
  const right = Math.ceil((frame.left + frame.width) * ratio) / ratio
  const bottom = Math.ceil((frame.top + frame.height) * ratio) / ratio
  const width = right - left
  const height = bottom - top

  return {
    ...frame,
    height,
    left,
    originX: left + (width * frame.anchorX),
    originY: top + (height * frame.anchorY),
    top,
    width,
  }
}

function handlePointerDown(event: PointerEvent, handle: TransformControlHandle): void {
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.focus({ preventScroll: true })
  }

  control.start({
    event,
    handle,
  })
}

function updateRotateTooltip(event: PointerEvent): void {
  if (!props.displayTransform || control.active) {
    return
  }

  rotateTooltip = resolveRotateTooltipFromEvent(event, props.displayTransform)
}

function handleRotatePointerLeave(): void {
  if (control.active) {
    return
  }

  rotateTooltip = undefined
}

function emitDisplayTransform(transform: DisplayTransform, mode: 'commit' | 'preview'): void {
  if (mode === 'commit') {
    emit('commit:displayTransform', transform)
    return
  }

  emit('preview:displayTransform', transform)
}

function emitCancelDisplayTransform(): void {
  emit('cancel:displayTransform')
}

function isEditingText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable
}

function resolveKeyboardMoveDelta(key: string): { x: number, y: number } | undefined {
  switch (key) {
    case 'ArrowLeft': {
      return { x: -1, y: 0 }
    }
    case 'ArrowRight': {
      return { x: 1, y: 0 }
    }
    case 'ArrowUp': {
      return { x: 0, y: -1 }
    }
    case 'ArrowDown': {
      return { x: 0, y: 1 }
    }
    default: {
      return undefined
    }
  }
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (!canvasFrame || !props.displayTransform || isEditingText(event.target) || isEditingText(document.activeElement)) {
    return
  }

  if (event.key === 'Escape' && control.active) {
    event.preventDefault()
    control.cancel()
    return
  }

  const delta = resolveKeyboardMoveDelta(event.key)
  if (!delta) {
    return
  }

  event.preventDefault()
  if (event.repeat) {
    return
  }

  const step = event.shiftKey ? KEYBOARD_FAST_MOVE_STEP : KEYBOARD_MOVE_STEP
  emitDisplayTransform({
    ...props.displayTransform,
    position: {
      x: props.displayTransform.position.x + (delta.x * step),
      y: props.displayTransform.position.y + (delta.y * step),
    },
  }, 'commit')
}

function handleWindowBlur(): void {
  if (control.active) {
    control.cancel()
  }
}

function projectFrameToViewport(
  currentFrame: TransformFrame,
  placement: Props['canvasPlacement'],
): TransformFrame {
  return {
    ...currentFrame,
    height: currentFrame.height * placement.scale,
    left: placement.left + (currentFrame.left * placement.scale),
    originX: placement.left + (currentFrame.originX * placement.scale),
    originY: placement.top + (currentFrame.originY * placement.scale),
    scaleX: currentFrame.scaleX * placement.scale,
    scaleY: currentFrame.scaleY * placement.scale,
    top: placement.top + (currentFrame.top * placement.scale),
    width: currentFrame.width * placement.scale,
  }
}

useEventListener(globalThis, 'keydown', handleGlobalKeydown)
useEventListener(globalThis, 'blur', handleWindowBlur)
</script>

<template>
  <div
    v-if="viewportFrame && props.displayTransform"
    data-transform-overlay-root
    data-testid="transform-overlay"
    class="pointer-events-auto inset-0 absolute"
    :class="$style.root"
    :style="{ cursor: TRANSFORM_OVERLAY_DEFAULT_CURSOR }"
  >
    <button
      type="button"
      class="pointer-events-auto absolute z-1 touch-none"
      :class="$style.dragZone"
      :style="{ ...frameStyle, cursor: TRANSFORM_OVERLAY_DEFAULT_CURSOR }"
      :aria-label="$t('edit.previewPanel.transformOverlay.move')"
      @pointerdown="handlePointerDown($event, 'move')"
    />

    <div
      data-testid="transform-overlay-frame"
      class="pointer-events-none absolute z-2"
      :class="$style.frame"
      :style="frameStyle"
    >
      <button
        v-for="handle in edgeHandles"
        :key="`edge-${handle}`"
        type="button"
        :data-testid="`transform-overlay-edge-${handle}`"
        class="pointer-events-auto absolute touch-none"
        :class="$style.edgeHandle"
        :style="scaleHandleStyles[handle]"
        :aria-label="$t('edit.previewPanel.transformOverlay.scale')"
        @pointerdown="handlePointerDown($event, handle)"
      />
    </div>

    <button
      v-for="handle in rotateHandles"
      :key="`rotate-${handle}`"
      type="button"
      :data-testid="`transform-overlay-rotate-${handle}`"
      class="pointer-events-auto absolute z-3 touch-none"
      :class="$style.rotateHandle"
      :style="getRotateHandleStyle(handle)"
      :aria-label="$t('edit.previewPanel.transformOverlay.rotate')"
      @pointerenter="updateRotateTooltip"
      @pointerleave="handleRotatePointerLeave"
      @pointermove="updateRotateTooltip"
      @pointerdown="handlePointerDown($event, 'rotate')"
    />

    <div
      :class="$style.cornerHandleLayer"
      :style="frameStyle"
    >
      <button
        v-for="handle in cornerHandles"
        :key="`corner-${handle}`"
        type="button"
        :data-testid="`transform-overlay-corner-${handle}`"
        class="bg-background absolute touch-none"
        :class="$style.cornerHandle"
        :style="scaleHandleStyles[handle]"
        :aria-label="$t('edit.previewPanel.transformOverlay.scale')"
        @pointerdown="handlePointerDown($event, handle)"
      />
    </div>

    <div
      class="pointer-events-none"
      :class="$style.sizeLabelAnchor"
      :style="sizeLabelStyle"
    >
      <output
        class="text-[11px] text-primary-foreground px-1.5 rounded-sm bg-[#0d99ff] pointer-events-none select-none whitespace-nowrap tabular-nums"
        :class="$style.sizeLabel"
      >
        {{ sizeLabel }}
      </output>
    </div>

    <output
      v-if="rotateTooltip"
      class="text-[11px] text-primary-foreground px-1.5 rounded-sm bg-[#0d99ff] pointer-events-none select-none absolute tabular-nums"
      :style="{ left: `${rotateTooltip.x}px`, top: `${rotateTooltip.y}px` }"
    >
      {{ `${rotateTooltip.degree}°` }}
    </output>
  </div>
</template>

<style module>
.drag-zone {
  position: absolute;
  padding: 0;
  outline: none;
  background: transparent;
  border: 0;
}

.root {
  position: absolute;
  inset: 0;
  pointer-events: auto;
}

.frame {
  position: absolute;
  box-sizing: border-box;
  outline: none;
  box-shadow: inset 0 0 0 2px #0d99ff;
}

.size-label-anchor {
  position: absolute;
  width: 0;
  height: 0;
}

.size-label {
  position: absolute;
  top: 0;
  left: 0;
  transform: translateX(-50%);
}

.corner-handle {
  position: absolute;
  box-sizing: content-box;
  width: 6px;
  height: 6px;
  padding: 0;
  pointer-events: auto;
  outline: none;
  border: 1px solid #0d99ff;
  border-radius: 1px;
  transform: translate(-50%, -50%);
}

.corner-handle-layer {
  position: absolute;
  z-index: 4;
  pointer-events: none;
}

.corner-handle::before,
.edge-handle::before {
  position: absolute;
  content: "";
}

.corner-handle::before {
  inset: -6px;
}

.edge-handle::before {
  inset: -4px;
}

.edge-handle {
  position: absolute;
  box-sizing: border-box;
  padding: 0;
  outline: none;
  background: transparent;
  border: 0;
}

.rotate-handle {
  position: absolute;
  box-sizing: border-box;
  padding: 0;
  outline: none;
  background: transparent;
  border: 0;
}
</style>
