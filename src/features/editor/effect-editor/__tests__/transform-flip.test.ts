import { describe, expect, it } from 'vitest'

import { flipTransformScaleAxis } from '../transform-flip'

describe('flipTransformScaleAxis', () => {
  it('按当前显式缩放值翻转指定轴并保留其他字段', () => {
    expect(flipTransformScaleAxis({
      axis: 'x',
      transform: {
        position: { x: 12 },
        rotation: 0.5,
        scale: { x: 1.25, y: -0.75 },
      },
    })).toEqual({
      position: { x: 12 },
      rotation: 0.5,
      scale: { x: -1.25, y: -0.75 },
    })
  })

  it('未显式设置缩放时使用展示值翻转指定轴', () => {
    expect(flipTransformScaleAxis({
      axis: 'y',
      baselineTransform: {
        scale: { x: 1.5, y: 0.8 },
      },
      transform: {
        alpha: 0.6,
      },
    })).toEqual({
      alpha: 0.6,
      scale: { y: -0.8 },
    })
  })

  it('无显式缩放和基线时使用编辑器默认展示值翻转指定轴', () => {
    expect(flipTransformScaleAxis({
      axis: 'x',
      transform: {
        alpha: 0.6,
      },
    })).toEqual({
      alpha: 0.6,
      scale: { x: -1 },
    })
  })
})
