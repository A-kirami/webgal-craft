import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import {
  materializeTransformDraftChange,
  mergeTransformBaseline,
  resolveTransformDraftDisplay,
  selectTransformBaseline,
} from '../model'

describe('selectTransformBaseline', () => {
  it('专用变换命令继承模式会深合并基础值与目标覆盖值', () => {
    const result = selectTransformBaseline({
      command: commandType.setTransform,
      writeDefault: false,
      baseTransform: {
        position: { x: 0, y: 20 },
        scale: { x: 1, y: 1 },
        rotation: 0,
      },
      targetTransform: {
        position: { x: 1000 },
        rotation: 0.5,
      },
    })

    expect(result).toEqual({
      baselineSource: 'protocol',
      baselineTransform: {
        position: { x: 1000, y: 20 },
        scale: { x: 1, y: 1 },
        rotation: 0.5,
      },
    })
  })

  it('普通命令会按基础默认值处理', () => {
    const result = selectTransformBaseline({
      command: commandType.changeFigure,
      writeDefault: false,
      baseTransform: {
        position: { x: 0, y: 20 },
      },
      targetTransform: {
        position: { x: 1000 },
      },
    })

    expect(result).toEqual({
      baselineSource: 'base',
      baselineTransform: {
        position: { x: 0, y: 20 },
      },
    })
  })

  it('缺少基础变换时不会把目标覆盖值伪造成基线', () => {
    const result = selectTransformBaseline({
      command: commandType.setTransform,
      writeDefault: false,
      targetTransform: {
        position: { x: 1000 },
      },
    })

    expect(result).toEqual({
      baselineSource: 'unknown',
    })
  })
})

describe('mergeTransformBaseline', () => {
  it('合并变换基线时不会补齐基础变换未提供的字段', () => {
    expect(mergeTransformBaseline(
      { position: { y: 20 } },
      { position: { x: 1000 } },
    )).toEqual({
      position: { y: 20 },
    })
  })
})

describe('resolveTransformDraftDisplay', () => {
  it('解析变换草稿显示态时会按显式值、基线与编辑器默认值补全注册字段', () => {
    const result = resolveTransformDraftDisplay({
      explicitDraftTransform: {
        alpha: 0.8,
        colorRed: 128,
        position: { y: 40 },
      },
      baselineTransform: {
        alpha: 1,
        blur: 6,
        colorRed: 255,
        colorGreen: 64,
        position: { x: 1000, y: 20 },
      },
      editorDefaultTransform: {
        colorBlue: 255,
        gamma: 1,
        position: { x: 0, y: 0 },
      },
    })

    expect(result.displayTransform).toEqual({
      alpha: 0.8,
      blur: 6,
      colorRed: 128,
      colorGreen: 64,
      colorBlue: 255,
      gamma: 1,
      position: { x: 1000, y: 40 },
    })
    expect(result.fieldSources).toMatchObject({
      'alpha': 'explicit',
      'blur': 'inherited',
      'colorBlue': 'editor-default',
      'colorGreen': 'inherited',
      'colorRed': 'explicit',
      'gamma': 'editor-default',
      'position.x': 'inherited',
      'position.y': 'explicit',
    })
  })

  it('解析变换草稿显示态时会区分基础基线字段来源', () => {
    const result = resolveTransformDraftDisplay({
      baselineSource: 'base',
      baselineTransform: {
        alpha: 1,
      },
      explicitDraftTransform: {},
    })

    expect(result.fieldSources.alpha).toBe('base')
  })
})

describe('materializeTransformDraftChange', () => {
  it('变换草稿变更只写入明确触达的兜底显示字段', () => {
    expect(materializeTransformDraftChange({
      explicitDraftTransform: {},
      change: {
        type: 'set-field',
        path: 'alpha',
        value: 0.8,
      },
    })).toEqual({
      alpha: 0.8,
    })
  })

  it('清空显式字段后不会写回基线兜底值', () => {
    expect(materializeTransformDraftChange({
      explicitDraftTransform: {
        alpha: 0.8,
        position: { x: 1000 },
      },
      change: {
        type: 'clear-field',
        path: 'position.x',
      },
    })).toEqual({
      alpha: 0.8,
    })
  })
})
