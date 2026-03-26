import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import {
  arg,
  commandRaw,
  content,
  deriveArgFieldsFromEditorFields,
  isFlagChoiceField,
  readArgFields,
  readContentField,
  readEditorFields,
  resolveI18n,
  resolveStatementSpecialContentMode,
  resolveSurfaceVariant,
  UNSPECIFIED,
} from '~/features/editor/command-registry/schema'

import type { CommandEntry, NumberField } from '~/features/editor/command-registry/schema'

describe('命令注册表 Schema 辅助函数', () => {
  it('resolveI18n 支持字符串和回调两种输入', () => {
    const t = (key: string) => `t:${key}`

    expect(resolveI18n('plain', t)).toBe('plain')
    expect(resolveI18n((translate, contentValue) => translate(`key:${contentValue}`), t, 'body')).toBe('t:key:body')
    expect(resolveI18n(undefined, t)).toBe('')
  })

  it('readArgFields 会展平 json-object 子字段并继承父级展示元信息', () => {
    const entry: CommandEntry = {
      type: commandType.changeFigure,
      label: 'changeFigure',
      description: 'changeFigure description',
      icon: 'icon',
      category: 'perform',
      fields: [
        arg({
          key: 'focus',
          type: 'json-object',
          label: 'focus',
          advanced: true,
          visibleWhen: { key: 'mode', value: 'manual' },
          fields: [
            {
              key: 'x',
              type: 'number',
              label: 'x',
              panelPairKey: 'y',
            } satisfies NumberField,
            {
              key: 'y',
              type: 'number',
              label: 'y',
            } satisfies NumberField,
          ],
        }),
      ],
    }

    const argFields = readArgFields(entry)

    expect(argFields).toHaveLength(2)
    expect(argFields[0]).toMatchObject({
      storageKey: 'focus',
      jsonMeta: { argKey: 'focus', fieldKey: 'x' },
    })
    expect(argFields[0].field).toMatchObject({
      key: 'focus.x',
      advanced: true,
      visibleWhen: { key: 'mode', value: 'manual' },
      panelPairKey: 'focus.y',
    })
  })

  it('readEditorFields 与 deriveArgFieldsFromEditorFields 保持 arg 元信息一致', () => {
    const entry: CommandEntry = {
      type: commandType.say,
      label: 'say',
      description: 'say description',
      icon: 'icon',
      category: 'display',
      fields: [
        content({ key: 'content', label: 'content', type: 'text' }),
        commandRaw({ key: 'speaker', label: 'speaker' }),
        arg({
          key: 'mode',
          type: 'choice',
          mode: 'flag',
          label: 'mode',
          options: [{ label: 'left', value: 'left' }],
          defaultValue: UNSPECIFIED,
        }),
      ],
    }

    const editorFields = readEditorFields(entry)

    expect(editorFields.map(field => field.storage)).toEqual(['content', 'commandRaw', 'arg'])
    expect(readContentField(entry)).toMatchObject({ key: 'content', type: 'text' })
    expect(deriveArgFieldsFromEditorFields(editorFields)).toEqual([
      {
        storageKey: 'mode',
        field: expect.objectContaining({ key: 'mode' }),
      },
    ])
  })

  it('resolveSurfaceVariant 支持 string / surface map / fallback', () => {
    expect(resolveSurfaceVariant('slider-input', 'panel', 'input')).toBe('slider-input')
    expect(resolveSurfaceVariant({ panel: 'slider-input', inline: 'input' }, 'panel', 'input')).toBe('slider-input')
    expect(resolveSurfaceVariant({ inline: 'input' }, 'panel', 'textarea-auto')).toBe('textarea-auto')
    expect(resolveSurfaceVariant(undefined, 'inline', 'input')).toBe('input')
  })

  it('resolveStatementSpecialContentMode 按命令类型返回特殊内容模式', () => {
    expect(resolveStatementSpecialContentMode({ command: commandType.setVar })).toBe('setVar')
    expect(resolveStatementSpecialContentMode({ command: commandType.choose })).toBe('choose')
    expect(resolveStatementSpecialContentMode({ command: commandType.applyStyle })).toBe('applyStyle')
    expect(resolveStatementSpecialContentMode({ command: commandType.say })).toBeUndefined()
  })

  it('isFlagChoiceField 仅在 mode=flag 时返回 true', () => {
    expect(isFlagChoiceField({
      key: 'mode',
      label: 'mode',
      type: 'choice',
      mode: 'flag',
      options: [],
    })).toBe(true)

    expect(isFlagChoiceField({
      key: 'mode',
      label: 'mode',
      type: 'choice',
      options: [],
    })).toBe(false)
  })
})
