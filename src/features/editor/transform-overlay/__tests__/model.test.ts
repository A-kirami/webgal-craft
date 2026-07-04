import { describe, expect, it } from 'vitest'

import {
  deriveDisplayTransform,
  materializeDisplayTransform,
} from '../model'

describe('deriveDisplayTransform', () => {
  it('未显式写出的几何字段会从已解析基线派生显示态', () => {
    const displayTransform = deriveDisplayTransform({
      explicitDraftTransform: {
        scale: { x: 2 },
      },
      baselineTransform: {
        position: { x: 40, y: -8 },
        scale: { x: 1.5, y: 1.2 },
        rotation: 0.3,
      },
    })

    expect(displayTransform).toEqual({
      position: { x: 40, y: -8 },
      scale: { x: 2, y: 1.2 },
      rotation: 0.3,
    })
  })

  it('缺少基线时未显式几何字段使用编辑器默认显示值', () => {
    const displayTransform = deriveDisplayTransform({
      explicitDraftTransform: {},
    })

    expect(displayTransform).toEqual({
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    })
  })
})

describe('materializeDisplayTransform', () => {
  it('表单回写只写入相对显示态发生变化的字段', () => {
    const explicitDraftTransform = {
      scale: { x: 2 },
    }
    const currentDisplayTransform = {
      position: { x: 40, y: -8 },
      scale: { x: 2, y: 1.2 },
      rotation: 0.3,
    }
    const nextDisplayTransform = {
      position: { x: 48, y: -8 },
      scale: { x: 2, y: 1.2 },
      rotation: 0.3,
    }

    expect(materializeDisplayTransform({
      currentDisplayTransform,
      explicitDraftTransform,
      nextDisplayTransform,
    })).toEqual({
      position: { x: 48 },
      scale: { x: 2 },
    })
  })

  it('表单回写会使用效果编辑器一致的旋转存储精度', () => {
    expect(materializeDisplayTransform({
      currentDisplayTransform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
      },
      explicitDraftTransform: {},
      nextDisplayTransform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: Math.PI / 2,
      },
    })).toEqual({
      rotation: 1.5708,
    })
  })

  it('拖拽继承显示态时只写入发生变化的几何字段', () => {
    expect(materializeDisplayTransform({
      currentDisplayTransform: {
        position: { x: 1000, y: 20 },
        scale: { x: 1, y: 1 },
        rotation: 0,
      },
      explicitDraftTransform: {},
      nextDisplayTransform: {
        position: { x: 1040, y: 20 },
        scale: { x: 1, y: 1 },
        rotation: 0,
      },
    })).toEqual({
      position: { x: 1040 },
    })
  })
})
