import { describe, expect, it } from 'vitest'

import {
  normalizeFieldStringValue,
  resolveFieldModelStringValue,
  resolvePanelSliderEmitValue,
} from '~/features/editor/statement-editor/field-utils'

describe('statement-editor field-utils: 事件工具', () => {
  it('normalizeFieldStringValue 统一归一化输入值', () => {
    const jsonNullValue = JSON.parse('null') as unknown

    expect(normalizeFieldStringValue(void 0)).toBe('')
    expect(normalizeFieldStringValue(jsonNullValue)).toBe('')
    expect(normalizeFieldStringValue(123)).toBe('123')
    expect(normalizeFieldStringValue('abc')).toBe('abc')
  })

  it('resolveFieldModelStringValue 保留数值 0，仅将空值与 false 映射为空字符串', () => {
    expect(resolveFieldModelStringValue()).toBe('')
    // eslint-disable-next-line unicorn/no-null
    expect(resolveFieldModelStringValue(null)).toBe('')
    expect(resolveFieldModelStringValue(false)).toBe('')
    expect(resolveFieldModelStringValue(0)).toBe('0')
    expect(resolveFieldModelStringValue('0')).toBe('0')
    expect(resolveFieldModelStringValue(12)).toBe('12')
  })

  it('resolvePanelSliderEmitValue 在无效输入时返回 undefined', () => {
    expect(resolvePanelSliderEmitValue()).toBeUndefined()
    expect(resolvePanelSliderEmitValue([])).toBeUndefined()
    expect(resolvePanelSliderEmitValue([Number.NaN])).toBeUndefined()
  })

  it('resolvePanelSliderEmitValue 在有效输入时返回字符串值', () => {
    expect(resolvePanelSliderEmitValue([2.5])).toBe('2.5')
  })
})
