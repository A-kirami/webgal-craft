import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { UNSPECIFIED } from '~/features/editor/command-registry/schema'
import { getParamValueFromArgs } from '~/features/editor/statement-editor/param-value'
import { filterExtraArgs } from '~/features/editor/statement-editor/visibility'

import type { arg } from 'webgal-parser/src/interface/sceneInterface'
import type { ArgField } from '~/features/editor/command-registry/schema'

/** 从字段属性快速构造 ArgField 测试夹具 */
function af(fieldDef: Record<string, unknown> & { key: string, type: string }): ArgField {
  return {
    storageKey: fieldDef.key,
    field: { label: '', ...fieldDef } as ArgField['field'],
  }
}

/** 构造 json-object 子字段的 ArgField 测试夹具 */
function jsonAf(opts: { argKey: string, fieldKey: string } & Record<string, unknown> & { type: string }): ArgField {
  const { argKey, fieldKey, ...rest } = opts
  return {
    storageKey: argKey,
    field: { key: `${argKey}.${fieldKey}`, label: '', ...rest } as ArgField['field'],
    jsonMeta: { argKey, fieldKey },
  }
}

const modeField = af({
  key: 'mode',
  type: 'choice',
  mode: 'flag',
  options: [
    { label: 'left', value: 'left' },
    { label: 'right', value: 'right' },
  ],
})
const speedField = af({ key: 'speed', type: 'number', defaultValue: 100 })

describe('语句编辑器核心工具', () => {
  it('getParamValueFromArgs 在 flag 选项被选中时返回选项 key', () => {
    expect(getParamValueFromArgs(modeField, [{ key: 'left', value: true }])).toBe('left')
  })

  it('getParamValueFromArgs 在 flag-choice 缺失时返回 UNSPECIFIED', () => {
    expect(getParamValueFromArgs(modeField, [])).toBe(UNSPECIFIED)
  })

  it('getParamValueFromArgs 对普通参数回退到默认值', () => {
    expect(getParamValueFromArgs(speedField, [])).toBe(100)
  })

  it('getParamValueFromArgs 支持展平的 json 字段', () => {
    const focusX = jsonAf({ argKey: 'focus', fieldKey: 'x', type: 'number', defaultValue: '' })
    expect(getParamValueFromArgs(focusX, [{ key: 'focus', value: '{"x":0.5}' }])).toBe(0.5)
    expect(getParamValueFromArgs(focusX, [{ key: 'focus', value: '{}' }])).toBe('')
  })

  it('getParamValueFromArgs 支持展平 json 的 number/file/choice 子字段', () => {
    const sliderField = jsonAf({ argKey: 'focus', fieldKey: 'x', type: 'number', variant: 'slider-input', defaultValue: '' })
    const fileField = jsonAf({ argKey: 'focus', fieldKey: 'asset', type: 'file', defaultValue: '' })
    const choiceField = jsonAf({ argKey: 'focus', fieldKey: 'motion', type: 'choice', defaultValue: '', variant: 'combobox' })
    const args: arg[] = [{
      key: 'focus',
      value: '{"x":"0.75","asset":"figure/hero.png","motion":"idle"}',
    }]

    expect(getParamValueFromArgs(sliderField, args)).toBe(0.75)
    expect(getParamValueFromArgs(fileField, args)).toBe('figure/hero.png')
    expect(getParamValueFromArgs(choiceField, args)).toBe('idle')
  })

  it('filterExtraArgs 移除 schema/control/speaker 参数并保留自定义参数', () => {
    const args: arg[] = [
      { key: 'speaker', value: 'Alice' },
      { key: 'next', value: true },
      { key: 'mode', value: 'left' },
      { key: 'left', value: true },
      { key: 'customKey', value: 'customValue' },
    ]
    const extra = filterExtraArgs({
      args, argFields: [modeField, speedField],
      command: commandType.say, excludeControlArgs: true,
    })
    expect(extra).toEqual([{ key: 'customKey', value: 'customValue' }])
  })
})
