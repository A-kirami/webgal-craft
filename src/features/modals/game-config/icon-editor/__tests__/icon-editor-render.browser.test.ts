import { describe, expect, it } from 'vitest'

import { renderIconCanvas } from '../icon-editor-render'
import { createDefaultIconEditorState } from '../icon-editor-state'

import type { IconEditorImageSource } from '../icon-editor-state'

function createCanvasImageSource(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void,
): IconEditorImageSource {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法创建测试画布')
  }
  draw(context)

  return {
    bytes: new Uint8Array(),
    image: canvas as unknown as HTMLImageElement,
  }
}

function createTransparentPaddedImageSource(): IconEditorImageSource {
  return createCanvasImageSource(4, 4, (context) => {
    context.fillStyle = '#FF0000'
    context.fillRect(1, 1, 2, 2)
  })
}

function createSolidImageSource(): IconEditorImageSource {
  return createCanvasImageSource(4, 4, (context) => {
    context.fillStyle = '#FF0000'
    context.fillRect(0, 0, 4, 4)
  })
}

function createWideImageSource(): IconEditorImageSource {
  return createCanvasImageSource(8, 4, (context) => {
    context.fillStyle = '#FF0000'
    context.fillRect(0, 0, 8, 4)
  })
}

function createWebInsetMarkerImageSource(): IconEditorImageSource {
  return createCanvasImageSource(100, 100, (context) => {
    context.fillStyle = '#FF0000'
    context.fillRect(0, 0, 100, 100)
    context.fillStyle = '#0000FF'
    context.fillRect(18, 0, 4, 100)
  })
}

function readPixel(canvas: HTMLCanvasElement | OffscreenCanvas, x: number, y: number): Uint8ClampedArray {
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法读取测试画布')
  }
  return context.getImageData(x, y, 1, 1).data
}

function readAlpha(canvas: HTMLCanvasElement | OffscreenCanvas, x: number, y: number): number {
  return readPixel(canvas, x, y)[3] ?? 0
}

describe('renderIconCanvas', () => {
  it('默认纯色背景会绘制白色底色', () => {
    const canvas = renderIconCanvas(createDefaultIconEditorState(), {
      kind: 'android-full-bleed',
      size: 8,
    })

    expect(readPixel(canvas, 0, 0)).toEqual(new Uint8ClampedArray([255, 255, 255, 255]))
  })

  it('偏移比例会按输出画布边长保持一致的视觉位移', () => {
    const state = createDefaultIconEditorState()
    state.foregroundImage = createSolidImageSource()
    state.foregroundOffsetRatio = { x: 0.25, y: 0 }
    state.iconShape = 'square'

    const canvas = renderIconCanvas(state, {
      kind: 'android-full-bleed',
      size: 8,
    })

    expect(readPixel(canvas, 0, 4)).toEqual(new Uint8ClampedArray([255, 255, 255, 255]))
    expect(readPixel(canvas, 2, 4)).toEqual(new Uint8ClampedArray([255, 0, 0, 255]))
  })

  it('绘制源图时保留图片自带的透明外圈', () => {
    const state = createDefaultIconEditorState()
    state.foregroundImage = createTransparentPaddedImageSource()
    state.iconShape = 'square'

    const canvas = renderIconCanvas(state, {
      kind: 'android-full-bleed',
      size: 8,
    })

    expect(readPixel(canvas, 0, 0)).toEqual(new Uint8ClampedArray([255, 255, 255, 255]))
    expect(readAlpha(canvas, 2, 2)).toBeGreaterThan(100)
    expect(readPixel(canvas, 7, 7)).toEqual(new Uint8ClampedArray([255, 255, 255, 255]))
  })

  it('生成 Web 图标时会先裁剪主安全区再裁剪 Web 边距', () => {
    const state = createDefaultIconEditorState()
    state.foregroundImage = createWebInsetMarkerImageSource()
    state.iconShape = 'square'

    const canvas = renderIconCanvas(state, {
      kind: 'web',
      size: 96,
    })
    const [red, , blue] = readPixel(canvas, 3, 48)

    expect(red).toBeGreaterThan(200)
    expect(blue).toBeLessThan(50)
  })

  it('生成 Maskable Web 图标时只裁剪主安全区', () => {
    const state = createDefaultIconEditorState()
    state.foregroundImage = createWebInsetMarkerImageSource()
    state.iconShape = 'square'

    const canvas = renderIconCanvas(state, {
      kind: 'web-maskable',
      size: 96,
    })
    const [red, , blue] = readPixel(canvas, 3, 48)

    expect(red).toBeLessThan(50)
    expect(blue).toBeGreaterThan(200)
  })

  it('绘制长方形源图时会按长边适配并保留透明留白', () => {
    const state = createDefaultIconEditorState()
    state.foregroundImage = createWideImageSource()
    state.iconShape = 'square'

    const canvas = renderIconCanvas(state, {
      kind: 'android-full-bleed',
      size: 8,
    })

    expect(readPixel(canvas, 0, 0)).toEqual(new Uint8ClampedArray([255, 255, 255, 255]))
    expect(readAlpha(canvas, 0, 2)).toBe(255)
    expect(readPixel(canvas, 7, 7)).toEqual(new Uint8ClampedArray([255, 255, 255, 255]))
  })

  it('生成 Android Legacy 预览时会裁剪旧版目标区并保留安全区透明边界', () => {
    const state = createDefaultIconEditorState()
    state.foregroundImage = createSolidImageSource()

    const canvas = renderIconCanvas(state, {
      kind: 'android-legacy',
      size: 96,
    })

    expect(readAlpha(canvas, 1, 48)).toBe(0)
    expect(readAlpha(canvas, 12, 48)).toBe(255)
  })

  it('生成 Android Legacy 预览时会使用参考实现的圆角半径而不是放大的预览半径', () => {
    const state = createDefaultIconEditorState()
    state.foregroundImage = createSolidImageSource()

    const canvas = renderIconCanvas(state, {
      kind: 'android-legacy',
      size: 96,
    })

    expect(readAlpha(canvas, 13, 12)).toBeLessThan(50)
    expect(readAlpha(canvas, 15, 12)).toBeGreaterThan(200)
  })

  it('生成 Android Round 预览时会裁剪圆形目标区并保留安全区透明边界', () => {
    const state = createDefaultIconEditorState()
    state.foregroundImage = createSolidImageSource()

    const canvas = renderIconCanvas(state, {
      kind: 'android-round',
      size: 96,
    })

    expect(readAlpha(canvas, 1, 48)).toBe(0)
    expect(readAlpha(canvas, 6, 48)).toBe(255)
  })
})
