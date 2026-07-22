import { describe, expect, it } from 'vitest'

import {
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

  it('所有归一化效果字段都能在展示空间完成边界 round-trip', () => {
    for (const path of ['alpha', 'brightness', 'contrast', 'saturation', 'bloom', 'bloomBrightness', 'bloomThreshold', 'bevel', 'bevelSoftness']) {
      const param = effectParamForPath(path)
      expect(param).toBeDefined()
      const displayValue = effectStoredToDisplay(param!, 0.8)
      expect(effectDisplayToStored(param!, displayValue)).toBeCloseTo(0.8)
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
