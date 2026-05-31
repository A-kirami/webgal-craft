import { ICON_EDITOR_CANVAS_SIZE } from './icon-editor-state'

import type {
  IconEditorImageSource,
  IconEditorOffsetRatio,
  IconEditorShape,
  IconEditorState,
} from './icon-editor-state'

export type IconPreviewKind =
  | 'android-full-bleed'
  | 'android-legacy'
  | 'android-round'
  | 'desktop'
  | 'web'
  | 'web-maskable'

export interface IconRenderOptions {
  kind: IconPreviewKind
  size: number
}

interface IconClipOptions {
  inset: number
  preservePadding?: boolean
  radius?: number
  shape: IconEditorShape
}

const ROUNDED_CLIP_REFERENCE_RADIUS = 34
const REFERENCE_CANVAS_DISPLAY_SIZE = 300
const CLIP_INSET = {
  android: {
    legacy: 0.1042,
    round: 0.0365,
  },
  desktop: 0.0636,
  main: 1 / 6,
  web: 0.0636,
}

function createCanvas(width: number, height = width): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document === 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function get2dContext(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法创建图标画布')
  }
  return context
}

function getSourceSize(image: HTMLImageElement): { height: number, width: number } {
  return {
    height: image.naturalHeight || image.height,
    width: image.naturalWidth || image.width,
  }
}

function drawRoundedRectanglePath(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.arcTo(x + width, y, x + width, y + radius, radius)
  context.lineTo(x + width, y + height - radius)
  context.arcTo(x + width, y + height, x + width - radius, y + height, radius)
  context.lineTo(x + radius, y + height)
  context.arcTo(x, y + height, x, y + height - radius, radius)
  context.lineTo(x, y + radius)
  context.arcTo(x, y, x + radius, y, radius)
}

function resolveRoundedClipRadius(sourceCanvas: HTMLCanvasElement | OffscreenCanvas): number {
  return ROUNDED_CLIP_REFERENCE_RADIUS * (sourceCanvas.width / REFERENCE_CANVAS_DISPLAY_SIZE)
}

function drawClipPath(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: IconEditorShape,
  width: number,
  height: number,
  radius: number,
) {
  switch (shape) {
    case 'square': {
      context.rect(0, 0, width, height)
      break
    }
    case 'rounded': {
      drawRoundedRectanglePath(context, 0, 0, width, height, radius)
      break
    }
    case 'circle': {
      context.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2)
      break
    }
    default: {
      const exhaustiveShape: never = shape
      throw new Error(`不支持的图标形状: ${exhaustiveShape}`)
    }
  }
}

function drawCenteredImage(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: IconEditorImageSource,
  offsetRatio: IconEditorOffsetRatio,
  scale: number,
) {
  const { height, width } = getSourceSize(source.image)
  if (width <= 0 || height <= 0) {
    return
  }

  const imageAspectRatio = width / height
  const targetWidth = (imageAspectRatio > 1 ? ICON_EDITOR_CANVAS_SIZE : ICON_EDITOR_CANVAS_SIZE * imageAspectRatio) * scale
  const targetHeight = (imageAspectRatio > 1 ? ICON_EDITOR_CANVAS_SIZE / imageAspectRatio : ICON_EDITOR_CANVAS_SIZE) * scale
  const targetX = (ICON_EDITOR_CANVAS_SIZE - targetWidth) / 2 + offsetRatio.x * ICON_EDITOR_CANVAS_SIZE
  const targetY = (ICON_EDITOR_CANVAS_SIZE - targetHeight) / 2 + offsetRatio.y * ICON_EDITOR_CANVAS_SIZE

  context.drawImage(source.image, targetX, targetY, targetWidth, targetHeight)
}

function drawComposedIcon(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  state: IconEditorState,
) {
  context.clearRect(0, 0, ICON_EDITOR_CANVAS_SIZE, ICON_EDITOR_CANVAS_SIZE)

  if (state.backgroundType === 'image' && state.backgroundImage) {
    drawCenteredImage(context, state.backgroundImage, state.backgroundOffsetRatio, state.backgroundScale)
  } else {
    context.fillStyle = state.backgroundColor
    context.fillRect(0, 0, ICON_EDITOR_CANVAS_SIZE, ICON_EDITOR_CANVAS_SIZE)
  }

  if (state.foregroundImage) {
    drawCenteredImage(context, state.foregroundImage, state.foregroundOffsetRatio, state.foregroundScale)
  }
}

function clipToCanvas(
  sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
  options: IconClipOptions,
): HTMLCanvasElement | OffscreenCanvas {
  const insetWidth = sourceCanvas.width * options.inset
  const insetHeight = sourceCanvas.height * options.inset
  const clippedWidth = sourceCanvas.width - insetWidth * 2
  const clippedHeight = sourceCanvas.height - insetHeight * 2
  const clippedCanvas = createCanvas(clippedWidth, clippedHeight)
  const clippedContext = get2dContext(clippedCanvas)

  clippedContext.imageSmoothingEnabled = true
  clippedContext.imageSmoothingQuality = 'high'
  clippedContext.fillStyle = '#000'
  clippedContext.beginPath()
  drawClipPath(
    clippedContext,
    options.shape,
    clippedWidth,
    clippedHeight,
    options.radius ?? resolveRoundedClipRadius(sourceCanvas),
  )
  clippedContext.closePath()
  clippedContext.fill()
  clippedContext.globalCompositeOperation = 'source-in'
  clippedContext.drawImage(
    sourceCanvas,
    -insetWidth,
    -insetHeight,
    sourceCanvas.width,
    sourceCanvas.height,
  )
  clippedContext.globalCompositeOperation = 'source-over'

  if (!options.preservePadding) {
    return clippedCanvas
  }

  const paddedCanvas = createCanvas(sourceCanvas.width, sourceCanvas.height)
  const paddedContext = get2dContext(paddedCanvas)
  paddedContext.imageSmoothingEnabled = true
  paddedContext.imageSmoothingQuality = 'high'
  paddedContext.drawImage(clippedCanvas, insetWidth, insetHeight)
  return paddedCanvas
}

function createPreviewCanvas(
  sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
  kind: IconPreviewKind,
  shape: IconEditorShape,
): HTMLCanvasElement | OffscreenCanvas {
  const maskableCanvas = clipToCanvas(sourceCanvas, {
    inset: CLIP_INSET.main,
    shape: 'square',
  })
  const roundedClipRadius = resolveRoundedClipRadius(maskableCanvas)

  switch (kind) {
    case 'android-full-bleed': {
      return sourceCanvas
    }
    case 'android-legacy': {
      return clipToCanvas(maskableCanvas, {
        inset: CLIP_INSET.android.legacy,
        preservePadding: true,
        radius: roundedClipRadius,
        shape: 'rounded',
      })
    }
    case 'android-round': {
      return clipToCanvas(maskableCanvas, {
        inset: CLIP_INSET.android.round,
        preservePadding: true,
        shape: 'circle',
      })
    }
    case 'desktop': {
      return clipToCanvas(maskableCanvas, {
        inset: CLIP_INSET.desktop,
        radius: roundedClipRadius,
        shape,
      })
    }
    case 'web': {
      return clipToCanvas(maskableCanvas, {
        inset: CLIP_INSET.web,
        radius: roundedClipRadius,
        shape,
      })
    }
    case 'web-maskable': {
      return maskableCanvas
    }
    default: {
      const exhaustiveKind: never = kind
      throw new Error(`不支持的图标预览类型: ${exhaustiveKind}`)
    }
  }
}

export function renderIconCanvas(state: IconEditorState, options: IconRenderOptions): HTMLCanvasElement | OffscreenCanvas {
  const sourceCanvas = createCanvas(ICON_EDITOR_CANVAS_SIZE)
  const sourceContext = get2dContext(sourceCanvas)
  drawComposedIcon(sourceContext, state)
  const previewCanvas = createPreviewCanvas(sourceCanvas, options.kind, state.iconShape)

  const outputCanvas = createCanvas(options.size)
  get2dContext(outputCanvas).drawImage(previewCanvas, 0, 0, options.size, options.size)
  return outputCanvas
}

export function renderIconSourceSnapshotCanvas(source: IconEditorImageSource): HTMLCanvasElement | OffscreenCanvas {
  const { height, width } = getSourceSize(source.image)
  if (width <= 0 || height <= 0) {
    throw new Error('图标源图尺寸无效')
  }

  const canvas = createCanvas(width, height)
  get2dContext(canvas).drawImage(source.image, 0, 0, width, height)
  return canvas
}

export async function canvasToPngBytes(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Uint8Array> {
  const blob = 'convertToBlob' in canvas
    ? await canvas.convertToBlob({ type: 'image/png' })
    : await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) {
            resolve(value)
            return
          }
          reject(new Error('图标 PNG 编码失败'))
        }, 'image/png')
      })

  return new Uint8Array(await blob.arrayBuffer())
}
