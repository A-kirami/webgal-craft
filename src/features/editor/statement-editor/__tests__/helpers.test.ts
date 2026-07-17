import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { UNSPECIFIED } from '~/features/editor/command-registry/schema'
import { getParamValueFromArgs } from '~/features/editor/statement-editor/param-value'
import {
  buildSchemaKeySet,
  filterExtraArgs,
  isParamVisibleByArgs,
  isParamVisibleByReader,
  pruneHiddenDependentArgs,
  pruneHiddenDependentArgsByReader,
} from '~/features/editor/statement-editor/visibility'

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
const detailField = af({ key: 'detail', type: 'text', visibleWhen: { key: 'mode', value: 'left' } })
const titleField = af({ key: 'title', type: 'text', visibleWhen: { key: 'name', notEmpty: true } })
const subtitleField = af({ key: 'subtitle', type: 'text', visibleWhen: { key: 'name', empty: true } })

describe('语句编辑器核心工具', () => {
  it('buildSchemaKeySet 包含参数 key 和 flag-choice 选项 key', () => {
    const keys = buildSchemaKeySet([modeField, speedField])
    expect(keys.has('mode')).toBe(true)
    expect(keys.has('speed')).toBe(true)
    expect(keys.has('left')).toBe(true)
    expect(keys.has('right')).toBe(true)
  })

  it('buildSchemaKeySet 对展平的 json 字段使用父 arg key', () => {
    const blinkField = jsonAf({ argKey: 'blink', fieldKey: 'blinkInterval', type: 'number' })
    const keys = buildSchemaKeySet([blinkField])
    expect(keys.has('blink')).toBe(true)
    expect(keys.has('blink.blinkInterval')).toBe(false)
  })

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

  it('isParamVisibleByArgs 支持 visibleWhen(value) 条件', () => {
    const visible = isParamVisibleByArgs({
      argField: detailField, argFields: [modeField, detailField],
      args: [{ key: 'left', value: true }], content: '',
    })
    const hidden = isParamVisibleByArgs({
      argField: detailField, argFields: [modeField, detailField],
      args: [{ key: 'right', value: true }], content: '',
    })
    expect(visible).toBe(true)
    expect(hidden).toBe(false)
  })

  it('isParamVisibleByArgs 支持 visibleWhen(notEmpty/empty) 条件', () => {
    const nameField = af({ key: 'name', type: 'text' })
    expect(isParamVisibleByArgs({
      argField: titleField, argFields: [nameField, titleField],
      args: [{ key: 'name', value: 'hero' }], content: '',
    })).toBe(true)
    expect(isParamVisibleByArgs({
      argField: subtitleField, argFields: [nameField, subtitleField],
      args: [], content: '',
    })).toBe(true)
  })

  it('pruneHiddenDependentArgs 在条件不再匹配时移除依赖参数', () => {
    const args: arg[] = [
      { key: 'left', value: true },
      { key: 'detail', value: 'fast' },
      { key: 'custom', value: 'x' },
    ]
    const pruned = pruneHiddenDependentArgs(args, modeField, 'right', [modeField, detailField])
    expect(pruned).toEqual([
      { key: 'left', value: true },
      { key: 'custom', value: 'x' },
    ])
  })

  it('isParamVisibleByReader 支持自定义运行时值提供者', () => {
    expect(isParamVisibleByReader({
      argField: detailField, argFields: [modeField, detailField],
      content: '', readParamValue: af => (af.field.key === 'mode' ? 'left' : void 0),
    })).toBe(true)
  })

  it('pruneHiddenDependentArgsByReader 移除隐藏依赖的 flag-choice 选项参数', () => {
    const subModeField = af({
      key: 'subMode',
      type: 'choice',
      mode: 'flag',
      options: [
        { label: 'sub-left', value: 'sub-left' },
        { label: 'sub-right', value: 'sub-right' },
      ],
      visibleWhen: { key: 'mode', value: 'left' },
    })
    const args: arg[] = [
      { key: 'left', value: true },
      { key: 'sub-left', value: true },
      { key: 'custom', value: 'x' },
    ]
    const pruned = pruneHiddenDependentArgsByReader({
      args, changedField: modeField, newValue: 'right',
      argFields: [modeField, subModeField], content: '',
      readParamValue: f => f.field.key === 'mode' ? 'right' : undefined,
    })
    expect(pruned).toEqual([
      { key: 'left', value: true },
      { key: 'custom', value: 'x' },
    ])
  })
})
