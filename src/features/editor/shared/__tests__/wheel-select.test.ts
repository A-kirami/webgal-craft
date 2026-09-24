import { describe, expect, it } from 'vitest'

import { resolveWheelNotches, resolveWheelSelectValue } from '../wheel-select'

describe('resolveWheelNotches', () => {
  it('像素模式按 100px 折算一格滚轮', () => {
    expect(resolveWheelNotches({ deltaMode: 0, deltaY: 100 })).toBe(1)
    expect(resolveWheelNotches({ deltaMode: 0, deltaY: -100 })).toBe(-1)
  })

  it('像素模式下不足一格的增量保留为小数', () => {
    expect(resolveWheelNotches({ deltaMode: 0, deltaY: 30 })).toBeCloseTo(0.3)
  })

  it('行模式按 3 行折算一格滚轮', () => {
    expect(resolveWheelNotches({ deltaMode: 1, deltaY: 3 })).toBe(1)
    expect(resolveWheelNotches({ deltaMode: 1, deltaY: -6 })).toBe(-2)
  })

  it('没有滚动位移时不产生步进', () => {
    expect(resolveWheelNotches({ deltaMode: 0, deltaY: 0 })).toBe(0)
  })
})

describe('resolveWheelSelectValue', () => {
  const optionValues = ['hero', 'villain', 'guide']

  it('向下滚动切换到下一个候选项', () => {
    expect(resolveWheelSelectValue(optionValues, 'hero', 1)).toBe('villain')
  })

  it('向上滚动切换到上一个候选项', () => {
    expect(resolveWheelSelectValue(optionValues, 'guide', -1)).toBe('villain')
  })

  it('已到候选项两端时不再切换', () => {
    expect(resolveWheelSelectValue(optionValues, 'guide', 1)).toBeUndefined()
    expect(resolveWheelSelectValue(optionValues, 'hero', -1)).toBeUndefined()
  })

  it('当前值不在候选项中时从滚动方向对应的一端进入', () => {
    expect(resolveWheelSelectValue(optionValues, '', 1)).toBe('hero')
    expect(resolveWheelSelectValue(optionValues, '', -1)).toBe('guide')
  })

  it('没有候选项时不切换', () => {
    expect(resolveWheelSelectValue([], 'hero', 1)).toBeUndefined()
    expect(resolveWheelSelectValue([], 'hero', -1)).toBeUndefined()
  })
})
