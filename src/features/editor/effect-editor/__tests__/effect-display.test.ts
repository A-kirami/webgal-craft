import { describe, expect, it } from 'vitest'

import {
  effectDisplayBounds,
  effectDisplayToStored,
  effectParamForPath,
  effectStoredToDisplay,
  serializeTransform,
  transformFieldsToDisplay,
} from '~/features/editor/effect-editor/effect-editor-config'

describe('效果字段展示转换', () => {
  it('按字段元数据转换百分比、角度和单位值', () => {
    const displayed = transformFieldsToDisplay({
      'scale.x': '1.25',
      'alpha': '0.8',
      'brightness': '1',
      'gamma': '1',
      'blur': '4',
      'rotation': String(Math.PI / 2),
      'bevelRotation': '45',
    })

    expect(displayed).toMatchObject({
      'scale.x': '125',
      'alpha': '80',
      'brightness': '100',
      'gamma': '1',
      'blur': '4',
      'rotation': '90',
      'bevelRotation': '45',
    })
  })

  it('支持展示值超过中性百分比并准确写回原始值', () => {
    const brightness = effectParamForPath('brightness')
    const bloom = effectParamForPath('bloom')

    expect(brightness).toBeDefined()
    expect(bloom).toBeDefined()
    expect(effectDisplayToStored(brightness!, 175)).toBeCloseTo(1.75)
    expect(effectDisplayToStored(bloom!, 250)).toBeCloseTo(2.5)
    expect(effectStoredToDisplay(brightness!, 1)).toBe(100)
  })

  it('百分比存储值转换为展示值时不暴露浮点误差', () => {
    const scaleX = effectParamForPath('scale.x')

    expect(scaleX).toBeDefined()
    expect(effectStoredToDisplay(scaleX!, 1.13)).toBe(113)
    expect(transformFieldsToDisplay({ 'scale.x': '1.13' })).toEqual({ 'scale.x': '113' })
  })

  it('所有归一化效果字段都按原始边界换算展示范围并完成 round-trip', () => {
    const expectedBounds = {
      alpha: [0, 100],
      brightness: [0, 200],
      contrast: [0, 200],
      saturation: [0, 200],
      bloom: [0, 500],
      bloomBrightness: [0, 200],
      bloomThreshold: [0, 100],
      bevel: [0, 100],
      bevelSoftness: [0, 100],
    } as const

    for (const [path, [displayMin, displayMax]] of Object.entries(expectedBounds)) {
      const param = effectParamForPath(path)
      expect(param).toBeDefined()
      if (param?.type !== 'number') {
        throw new Error(`Expected numeric effect parameter: ${path}`)
      }

      const bounds = effectDisplayBounds(param)
      expect(bounds.min).toBe(displayMin)
      expect(bounds.max).toBe(displayMax)
      expect(effectStoredToDisplay(param, param.min!)).toBe(displayMin)
      expect(effectStoredToDisplay(param, param.max!)).toBe(displayMax)
      expect(effectDisplayToStored(param, displayMin)).toBeCloseTo(param.min!)
      expect(effectDisplayToStored(param, displayMax)).toBeCloseTo(param.max!)
    }
  })

  it('序列化仍保留引擎原始倍率和角度单位', () => {
    expect(serializeTransform({
      alpha: 0.8,
      brightness: 1.5,
      rotation: Math.PI / 2,
      scale: { x: 1.25, y: 1.25 },
    })).toBe('{"scale":{"x":1.25,"y":1.25},"rotation":1.5707963267948966,"alpha":0.8,"brightness":1.5}')
  })
})
