import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { CUSTOM_CONTENT, UNSPECIFIED } from '~/features/editor/command-registry/schema'
import {
  getParamValueFromArgs,
  hasParamExplicitValue,
  resolveParamSelectValue,
} from '~/features/editor/statement-editor/param-value'

import type { CommandNode, GenericCommandNode } from '~/domain/script/types'
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

function createJsonArgField(
  options: Record<string, unknown> & { argKey: string, fieldKey: string, type: string },
): ArgField {
  const { argKey, fieldKey, ...field } = options
  return {
    storageKey: argKey,
    field: {
      key: `${argKey}.${fieldKey}`,
      label: '',
      ...field,
    } as ArgField['field'],
    jsonMeta: {
      argKey,
      fieldKey,
    },
  }
}

function createCommandNode(args: GenericCommandNode['args']): CommandNode {
  return {
    type: commandType.changeFigure,
    commandRaw: 'changeFigure',
    inlineComment: '',
    content: 'figure.png',
    args,
  } satisfies GenericCommandNode
}

describe('参数取值辅助函数', () => {
  it('getParamValueFromArgs 在 json 参数为布尔值时回退默认值', () => {
    const focusXField = createJsonArgField({
      argKey: 'focus',
      fieldKey: 'x',
      type: 'number',
      defaultValue: 0.5,
    })

    expect(getParamValueFromArgs(focusXField, [{ key: 'focus', value: true }])).toBe(0.5)
  })

  it('resolveParamSelectValue 在缺省值且含 UNSPECIFIED 选项时回退到 UNSPECIFIED', () => {
    const field = createArgField({
      key: 'mode',
      type: 'choice',
      options: [
        { label: 'inherit', value: UNSPECIFIED },
        { label: 'left', value: 'left' },
      ],
      customizable: true,
    })

    expect(resolveParamSelectValue({
      argField: field,
      currentValue: '',
      hasExplicitValue: false,
      dynamicOptions: [],
      staticOptions: field.field.type === 'choice'
        ? field.field.options.map(option => ({ label: String(option.label), value: option.value }))
        : [],
    })).toBe(UNSPECIFIED)
  })

  it('resolveParamSelectValue 在 customizable 值未命中选项时返回 CUSTOM_CONTENT', () => {
    const field = createArgField({
      key: 'target',
      type: 'choice',
      customizable: true,
      options: [{ label: 'left', value: 'fig-left' }],
    })

    expect(resolveParamSelectValue({
      argField: field,
      currentValue: 'custom-node',
      hasExplicitValue: true,
      dynamicOptions: [],
      staticOptions: [{ label: 'left', value: 'fig-left' }],
    })).toBe(CUSTOM_CONTENT)
  })

  it('hasParamExplicitValue 对 commandNode 的 json 父参数按存在性判定', () => {
    const focusMotionField = createJsonArgField({
      argKey: 'focus',
      fieldKey: 'motion',
      type: 'choice',
      options: [],
    })

    expect(hasParamExplicitValue({
      argField: focusMotionField,
      commandNode: createCommandNode([{ key: 'focus', value: '{"motion":"idle"}' }]),
    })).toBe(true)
  })

  it('hasParamExplicitValue 对 customizable choice 的空字符串保留显式值语义', () => {
    const targetField = createArgField({
      key: 'target',
      type: 'choice',
      customizable: true,
      options: [],
    })

    expect(hasParamExplicitValue({
      argField: targetField,
      commandNode: createCommandNode([{ key: 'target', value: '' }]),
    })).toBe(true)
  })
})
