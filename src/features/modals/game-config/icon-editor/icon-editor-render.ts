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
  /**
   * 组合画布的分辨率，默认按导出分辨率 {@link ICON_EDITOR_CANVAS_SIZE}。
   * 预览按显示尺寸取值即可：画布成本随面积下降，颜色/变换调整不必按导出分辨率重算。
   */
  sourceSize?: number
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

type RenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

interface RenderTarget {
  canvas: HTMLCanvasElement | OffscreenCanvas
  context: RenderContext
}

/**
 * 一次渲染要经过组合、裁剪、缩放多个中间画布；预览还会连续渲染多个变体。
 * 复用这些画布可以省掉重复的分配与取上下文（实测占单次预览渲染的大头），
 * 每次取用时按角色清空，语义与新建画布一致。
 */
export type IconRenderScratch = Map<string, RenderTarget>

export function createIconRenderScratch(): IconRenderScratch {
  return new Map()
}

function acquireRenderTarget(
  scratch: IconRenderScratch | undefined,
  role: string,
  width: number,
  height = width,
): RenderTarget {
  const targetWidth = Math.max(1, Math.round(width))
  const targetHeight = Math.max(1, Math.round(height))
  if (!scratch) {
    const canvas = createCanvas(targetWidth, targetHeight)
    return { canvas, context: get2dContext(canvas) }
  }

  const key = `${role}:${targetWidth}x${targetHeight}`
  const existing = scratch.get(key)
  if (existing) {
    existing.context.clearRect(0, 0, targetWidth, targetHeight)
    return existing
  }

  const canvas = createCanvas(targetWidth, targetHeight)
  const target: RenderTarget = { canvas, context: get2dContext(canvas) }
  scratch.set(key, target)
  return target
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
  baseSize: number,
) {
  const { height, width } = getSourceSize(source.image)
  if (width <= 0 || height <= 0) {
    return
  }

  const imageAspectRatio = width / height
  const targetWidth = (imageAspectRatio > 1 ? baseSize : baseSize * imageAspectRatio) * scale
  const targetHeight = (imageAspectRatio > 1 ? baseSize / imageAspectRatio : baseSize) * scale
  const targetX = (baseSize - targetWidth) / 2 + offsetRatio.x * baseSize
  const targetY = (baseSize - targetHeight) / 2 + offsetRatio.y * baseSize

  context.drawImage(source.image, targetX, targetY, targetWidth, targetHeight)
}

function drawComposedIcon(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  state: IconEditorState,
  baseSize: number,
) {
  context.clearRect(0, 0, baseSize, baseSize)

  if (state.backgroundType === 'image' && state.backgroundImage) {
    drawCenteredImage(context, state.backgroundImage, state.backgroundOffsetRatio, state.backgroundScale, baseSize)
  } else {
    context.fillStyle = state.backgroundColor
    context.fillRect(0, 0, baseSize, baseSize)
  }

  if (state.foregroundImage) {
    drawCenteredImage(context, state.foregroundImage, state.foregroundOffsetRatio, state.foregroundScale, baseSize)
  }
}

function clipToCanvas(
  sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
  options: IconClipOptions,
  scratch: IconRenderScratch | undefined,
): HTMLCanvasElement | OffscreenCanvas {
  const insetWidth = sourceCanvas.width * options.inset
  const insetHeight = sourceCanvas.height * options.inset
  const clippedWidth = sourceCanvas.width - insetWidth * 2
  const clippedHeight = sourceCanvas.height - insetHeight * 2
  const clippedTarget = acquireRenderTarget(scratch, 'clip', clippedWidth, clippedHeight)
  const clippedCanvas = clippedTarget.canvas
  const clippedContext = clippedTarget.context

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

  const paddedTarget = acquireRenderTarget(scratch, 'padded', sourceCanvas.width, sourceCanvas.height)
  const paddedContext = paddedTarget.context
  paddedContext.imageSmoothingEnabled = true
  paddedContext.imageSmoothingQuality = 'high'
  paddedContext.drawImage(clippedCanvas, insetWidth, insetHeight)
  return paddedTarget.canvas
}

function createPreviewCanvas(
  sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
  maskableCanvas: HTMLCanvasElement | OffscreenCanvas,
  kind: IconPreviewKind,
  shape: IconEditorShape,
  scratch: IconRenderScratch | undefined,
): HTMLCanvasElement | OffscreenCanvas {
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
      }, scratch)
    }
    case 'android-round': {
      return clipToCanvas(maskableCanvas, {
        inset: CLIP_INSET.android.round,
        preservePadding: true,
        shape: 'circle',
      }, scratch)
    }
    case 'desktop': {
      return clipToCanvas(maskableCanvas, {
        inset: CLIP_INSET.desktop,
        radius: roundedClipRadius,
        shape,
      }, scratch)
    }
    case 'web': {
      return clipToCanvas(maskableCanvas, {
        inset: CLIP_INSET.web,
        radius: roundedClipRadius,
        shape,
      }, scratch)
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

function createMaskableCanvas(
  sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
  scratch: IconRenderScratch | undefined,
): HTMLCanvasElement | OffscreenCanvas {
  return clipToCanvas(sourceCanvas, {
    inset: CLIP_INSET.main,
    shape: 'square',
  }, scratch)
}

export function renderIconCanvas(
  state: IconEditorState,
  options: IconRenderOptions,
): HTMLCanvasElement | OffscreenCanvas {
  const baseSize = options.sourceSize ?? ICON_EDITOR_CANVAS_SIZE
  const sourceTarget = acquireRenderTarget(undefined, 'source', baseSize)
  drawComposedIcon(sourceTarget.context, state, baseSize)
  const maskableCanvas = createMaskableCanvas(sourceTarget.canvas, undefined)
  const previewCanvas = createPreviewCanvas(sourceTarget.canvas, maskableCanvas, options.kind, state.iconShape, undefined)

  const outputTarget = acquireRenderTarget(undefined, 'output', options.size)
  outputTarget.context.drawImage(previewCanvas, 0, 0, options.size, options.size)
  return outputTarget.canvas
}

/** 同一次改动的多个预览变体共用的组合结果 */
interface IconPreviewComposition {
  maskableCanvas: HTMLCanvasElement | OffscreenCanvas
  revision: number
  sourceCanvas: HTMLCanvasElement | OffscreenCanvas
  sourceSize: number
}

let previewComposition: IconPreviewComposition | undefined

export interface IconPreviewRenderOptions {
  kind: IconPreviewKind
  /** 每次改动递增，用于判断能否复用上一次的组合结果 */
  revision: number
  size: number
  sourceSize?: number
  scratch?: IconRenderScratch
}

/**
 * 预览渲染：一次改动会渲染多个变体（不同裁剪方式），组合与主安全区裁剪对所有变体相同。
 * 按 revision 复用这两步，只让各变体做自己那一段裁剪与缩放。
 */
export function renderIconPreviewCanvas(
  state: IconEditorState,
  options: IconPreviewRenderOptions,
): HTMLCanvasElement | OffscreenCanvas {
  const sourceSize = options.sourceSize ?? ICON_EDITOR_CANVAS_SIZE
  if (
    !previewComposition
    || previewComposition.revision !== options.revision
    || previewComposition.sourceSize !== sourceSize
  ) {
    const sourceTarget = acquireRenderTarget(options.scratch, 'source', sourceSize)
    drawComposedIcon(sourceTarget.context, state, sourceSize)
    previewComposition = {
      maskableCanvas: createMaskableCanvas(sourceTarget.canvas, options.scratch),
      revision: options.revision,
      sourceCanvas: sourceTarget.canvas,
      sourceSize,
    }
  }

  const previewCanvas = createPreviewCanvas(
    previewComposition.sourceCanvas,
    previewComposition.maskableCanvas,
    options.kind,
    state.iconShape,
    options.scratch,
  )
  const outputTarget = acquireRenderTarget(options.scratch, 'output', options.size)
  outputTarget.context.drawImage(previewCanvas, 0, 0, options.size, options.size)
  return outputTarget.canvas
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
