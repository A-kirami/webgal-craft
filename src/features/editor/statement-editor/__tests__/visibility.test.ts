import { describe, expect, it } from 'vitest'

import { buildSchemaKeySet, isParamVisibleByArgs, pruneHiddenDependentArgs } from '~/features/editor/statement-editor/visibility'

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

describe('可见性辅助函数', () => {
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

  it('pruneHiddenDependentArgs 会清理失效的 flag-choice 依赖参数', () => {
    const modeField = createArgField({
      key: 'mode',
      type: 'choice',
      mode: 'flag',
      options: [
        { label: 'left', value: 'left' },
        { label: 'right', value: 'right' },
      ],
    })
    const subModeField = createArgField({
      key: 'subMode',
      type: 'choice',
      mode: 'flag',
      options: [
        { label: 'fade', value: 'fade' },
        { label: 'zoom', value: 'zoom' },
      ],
      visibleWhen: { key: 'mode', value: 'left' },
    })

    expect(pruneHiddenDependentArgs([
      { key: 'left', value: true },
      { key: 'fade', value: true },
      { key: 'custom', value: 'keep' },
    ], modeField, 'right', [modeField, subModeField])).toEqual([
      { key: 'left', value: true },
      { key: 'custom', value: 'keep' },
    ])
  })
})
