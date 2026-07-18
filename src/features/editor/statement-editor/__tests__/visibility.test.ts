import { describe, expect, it } from 'vitest'

import { buildSchemaKeySet, isParamVisibleByArgs, isParamVisibleByReader } from '~/features/editor/statement-editor/visibility'

import type { ArgField } from '~/features/editor/command-registry/schema'

function createArgField(field: Record<string, unknown> & { key: string, type: string }): ArgField {
  return {
    storageKey: field.key,
    field: {
      label: '',
      ...field,
    } as ArgField['field'],
  }
}

describe('visibility', () => {
  it('buildSchemaKeySet 为 flag-choice 同时收集存储 key 与选项 key', () => {
    const modeField = createArgField({
      key: 'mode',
      type: 'choice',
      mode: 'flag',
      options: [
        { label: 'left', value: 'left' },
        { label: 'right', value: 'right' },
      ],
    })

    const keySet = buildSchemaKeySet([modeField])

    expect(keySet.has('mode')).toBe(true)
    expect(keySet.has('left')).toBe(true)
    expect(keySet.has('right')).toBe(true)
  })

  it('buildSchemaKeySet 对展平的 json 字段使用父 arg key', () => {
    const blinkField: ArgField = {
      storageKey: 'blink',
      field: { key: 'blink.blinkInterval', type: 'number', label: '' },
      jsonMeta: { argKey: 'blink', fieldKey: 'blinkInterval' },
    }

    expect([...buildSchemaKeySet([blinkField])]).toEqual(['blink'])
  })

  it('isParamVisibleByArgs 会先执行 visibleWhenContent', () => {
    const titleField = createArgField({
      key: 'title',
      type: 'text',
      visibleWhenContent: (content: string) => content.includes('title'),
    })

    expect(isParamVisibleByArgs({
      argField: titleField,
      argFields: [titleField],
      args: [],
      content: 'has title',
    })).toBe(true)

    expect(isParamVisibleByArgs({
      argField: titleField,
      argFields: [titleField],
      args: [],
      content: 'content only',
    })).toBe(false)
  })

  it('isParamVisibleByArgs 在依赖字段缺失时按可见处理', () => {
    const dependentField = createArgField({
      key: 'subtitle',
      type: 'text',
      visibleWhen: { key: 'missing', value: 'x' },
    })

    expect(isParamVisibleByArgs({
      argField: dependentField,
      argFields: [dependentField],
      args: [],
      content: '',
    })).toBe(true)
  })

  it.each([
    { condition: { key: 'mode', value: 'left' }, value: 'left', expected: true },
    { condition: { key: 'mode', value: 'left' }, value: 'right', expected: false },
    { condition: { key: 'mode', notEmpty: true }, value: 'left', expected: true },
    { condition: { key: 'mode', notEmpty: true }, value: '', expected: false },
    { condition: { key: 'mode', empty: true }, value: undefined, expected: true },
    { condition: { key: 'mode', empty: true }, value: 'left', expected: false },
  ] as const)('isParamVisibleByReader 按 $condition 判断 $value 的可见性', ({ condition, value, expected }) => {
    const modeField = createArgField({ key: 'mode', type: 'text' })
    const dependentField = createArgField({ key: 'dependent', type: 'text', visibleWhen: condition })

    expect(isParamVisibleByReader({
      argField: dependentField,
      argFields: [modeField, dependentField],
      content: '',
      readParamValue: field => field === modeField ? value : undefined,
    })).toBe(expected)
  })

  it('依赖字段自身不可见时隐藏当前字段', () => {
    const rootField = createArgField({ key: 'root', type: 'text' })
    const parentField = createArgField({
      key: 'parent',
      type: 'text',
      visibleWhen: { key: 'root', notEmpty: true },
    })
    const childField = createArgField({
      key: 'child',
      type: 'text',
      visibleWhen: { key: 'parent', notEmpty: true },
    })
    const argFields = [rootField, parentField, childField]

    expect(isParamVisibleByArgs({
      argField: childField,
      argFields,
      args: [{ key: 'parent', value: 'configured' }],
      content: '',
    })).toBe(false)
    expect(isParamVisibleByArgs({
      argField: childField,
      argFields,
      args: [
        { key: 'root', value: 'configured' },
        { key: 'parent', value: 'configured' },
      ],
      content: '',
    })).toBe(true)
  })

  it('循环可见性依赖按隐藏处理', () => {
    const firstField = createArgField({
      key: 'first',
      type: 'text',
      visibleWhen: { key: 'second', notEmpty: true },
    })
    const secondField = createArgField({
      key: 'second',
      type: 'text',
      visibleWhen: { key: 'first', notEmpty: true },
    })

    expect(isParamVisibleByArgs({
      argField: firstField,
      argFields: [firstField, secondField],
      args: [
        { key: 'first', value: 'a' },
        { key: 'second', value: 'b' },
      ],
      content: '',
    })).toBe(false)
  })
})
