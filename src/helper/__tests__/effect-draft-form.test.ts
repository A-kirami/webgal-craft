import { describe, expect, it } from 'vitest'

import {
  EffectDraftFormLabelResolver,
  getAxisCompactLabel,
  getLinkedSliderInputAriaLabel,
  getLinkedSliderLabel,
} from '~/helper/effect-draft-form'

import type { I18nT, NumberField } from '~/helper/command-registry/schema'

const translator = ((key: string) => `i18n:${key}`) as unknown as I18nT

const resolveLabel: EffectDraftFormLabelResolver = (value) => {
  if (!value) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  return value(translator)
}

const baseParam: NumberField & { linkedPairKey: string } = {
  key: 'scale.x',
  label: 'scale label',
  type: 'number',
  linkedPairKey: 'scale.y',
}

describe('特效草稿表单辅助函数', () => {
  it('存在 linkedGroupLabel 时优先使用它', () => {
    const param = {
      ...baseParam,
      linkedGroupLabel: (t: I18nT) => `group:${t('modals.effectEditor.params.scale')}`,
    }
    expect(getLinkedSliderLabel(param, resolveLabel)).toBe('group:i18n:modals.effectEditor.params.scale')
  })

  it('缺少分组标签时回退到 label', () => {
    expect(getLinkedSliderLabel(baseParam, resolveLabel)).toBe('scale label')
  })

  it('将坐标轴标签解析为 X 或 Y', () => {
    expect(getAxisCompactLabel('foo.x')).toBe('X')
    expect(getAxisCompactLabel('foo.y')).toBe('Y')
    expect(getAxisCompactLabel('foo')).toBe('Y')
  })

  it('构造包含坐标轴后缀的 aria 标签', () => {
    const param = {
      ...baseParam,
      linkedGroupLabel: 'Scale',
    }
    expect(getLinkedSliderInputAriaLabel(param, 0, resolveLabel)).toBe('Scale X')
    expect(getLinkedSliderInputAriaLabel(param, 1, resolveLabel)).toBe('Scale Y')
  })
})
