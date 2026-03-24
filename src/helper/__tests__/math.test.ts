import { describe, expect, it } from 'vitest'

import {
  applyScrubStepModifier,
  clamp,
  degreeToRadian,
  getPointerAngleDegrees,
  normalizeAngleDelta,
  normalizeDegree,
  normalizeStepPrecision,
  radianToDegree,
  roundByStep,
  roundToPrecision,
} from '~/helper/math'

function createPointerEvent(clientX: number, clientY: number): PointerEvent {
  return { clientX, clientY } as PointerEvent
}

describe('clamp', () => {
  it.each([
    ['命中区间内的值', 5, 0, 10, 5],
    ['小于最小值时钳制到下限', -3, 0, 10, 0],
    ['大于最大值时钳制到上限', 15, 0, 10, 10],
    ['省略最小值时保留原值', -999, undefined, 10, -999],
    ['省略最小值时仍尊重最大值', 15, undefined, 10, 10],
    ['省略最大值时仍尊重最小值', -1, 0, undefined, 0],
    ['省略边界时直接返回原值', 42, undefined, undefined, 42],
  ])('%s', (_, value, min, max, expected) => {
    expect(clamp(value, min, max)).toBe(expected)
  })
})

describe('normalizeStepPrecision', () => {
  it.each([
    ['整数步长返回 0', 1, 0],
    ['多位整数步长仍返回 0', 10, 0],
    ['一位小数返回 1', 0.1, 1],
    ['两位小数返回 2', 0.01, 2],
    ['三位小数返回 3', 0.005, 3],
    ['科学计数法 1e-4 返回 4', 1e-4, 4],
    ['科学计数法 1e-7 返回 7', 1e-7, 7],
  ])('%s', (_, step, expected) => {
    expect(normalizeStepPrecision(step)).toBe(expected)
  })
})

describe('roundByStep', () => {
  it.each([
    ['按两位小数步长舍入', 3.456, 0.01, 3.46],
    ['按一位小数步长舍入', 3.456, 0.1, 3.5],
    ['按整数步长舍入', 3.456, 1, 3],
  ])('%s', (_, value, step, expected) => {
    expect(roundByStep(value, step)).toBe(expected)
  })
})

describe('角度与弧度转换', () => {
  it('将 PI 转成 180 度', () => {
    expect(radianToDegree(Math.PI)).toBeCloseTo(180)
  })

  it('将 0 弧度转成 0 度', () => {
    expect(radianToDegree(0)).toBe(0)
  })

  it('将 180 度转成 PI', () => {
    expect(degreeToRadian(180)).toBeCloseTo(Math.PI)
  })

  it('往返转换后保持精度', () => {
    expect(radianToDegree(degreeToRadian(45))).toBeCloseTo(45)
    expect(degreeToRadian(radianToDegree(1))).toBeCloseTo(1)
  })
})

describe('roundToPrecision', () => {
  it('按指定位数舍入', () => {
    expect(roundToPrecision(3.1415_9, 2)).toBe(3.14)
    expect(roundToPrecision(3.1415_9, 0)).toBe(3)
  })
})

describe('normalizeAngleDelta', () => {
  it.each([
    ['区间内的值保持不变', 0, 0],
    ['上边界 180 保持不变', 180, 180],
    ['下边界 -180 保持不变', -180, -180],
    ['大正角度会回绕', 270, -90],
    ['更大的正角度会回绕到 180', 540, 180],
    ['大负角度会回绕', -270, 90],
    ['更大的负角度会回绕到 -180', -540, -180],
  ])('%s', (_, value, expected) => {
    expect(normalizeAngleDelta(value)).toBe(expected)
  })
})

describe('normalizeDegree', () => {
  it.each([
    ['0 度保持不变', 0, 0],
    ['359 度保持不变', 359, 359],
    ['360 度归一化到 0', 360, 0],
    ['450 度归一化到 90', 450, 90],
    ['-90 度归一化到 270', -90, 270],
  ])('%s', (_, value, expected) => {
    expect(normalizeDegree(value)).toBe(expected)
  })

  it('保留 -360 度得到的 -0 语义', () => {
    // -360 % 360 === -0 in JS, normalizeDegree 走 +360 分支得到 -0+360=360, 再 %360=0
    // 但实际 -360%360 = -0, -0 < 0 为 false, 所以直接返回 -0
    expect(Object.is(normalizeDegree(-360), -0)).toBe(true)
  })
})

describe('getPointerAngleDegrees', () => {
  it.each([
    ['指针位于中心右侧时返回 0°', createPointerEvent(200, 100), 0],
    ['指针位于中心下方时返回 90°', createPointerEvent(100, 200), 90],
    ['指针位于中心上方时返回 -90°', createPointerEvent(100, 0), -90],
  ])('%s', (_, event, expected) => {
    expect(getPointerAngleDegrees(event, 100, 100)).toBeCloseTo(expected)
  })
})

describe('applyScrubStepModifier', () => {
  it.each([
    ['未按修饰键时保留基础步长', { altKey: false, shiftKey: false }, 1],
    ['按下 Alt 时使用 0.1 倍步长', { altKey: true, shiftKey: false }, 0.1],
    ['按下 Shift 时使用 10 倍步长', { altKey: false, shiftKey: true }, 10],
    ['同时按下 Alt 和 Shift 时优先使用 Alt', { altKey: true, shiftKey: true }, 0.1],
  ])('%s', (_, event, expected) => {
    expect(applyScrubStepModifier(1, event)).toBeCloseTo(expected)
  })

  it('允许通过选项覆盖倍率', () => {
    const event = { altKey: true, shiftKey: false }
    expect(applyScrubStepModifier(2, event, { altFactor: 0.5 })).toBe(1)

    const shiftEvent = { altKey: false, shiftKey: true }
    expect(applyScrubStepModifier(2, shiftEvent, { shiftFactor: 5 })).toBe(10)
  })
})
