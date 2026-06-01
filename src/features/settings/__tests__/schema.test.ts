import { describe, expect, expectTypeOf, it } from 'vitest'

import { defineSettingsSchema } from '../schema'

describe('defineSettingsSchema', () => {
  it('从 schema 派生默认值、验证模式和 immediateFields', () => {
    const result = defineSettingsSchema({
      general: {
        label: '常规',
        fields: {
          autoSave: {
            type: 'switch',
            default: true,
            immediate: true,
            label: '自动保存',
          },
          selectField: {
            type: 'select',
            default: 'primary',
            label: '选择字段',
            options: [
              { value: 'primary', label: '选项 A' },
              { value: 'secondary', label: '选项 B' },
            ],
          },
          fontSize: {
            type: 'number',
            default: 14,
            min: 8,
            max: 48,
            label: '字体大小',
          },
          projectPath: {
            type: 'folderPicker',
            default: '',
            label: '项目路径',
          },
        },
      },
    } as const)

    expect(result.defaults).toEqual({
      autoSave: true,
      selectField: 'primary',
      fontSize: 14,
      projectPath: '',
    })
    expect(result.fieldNames).toEqual([
      'autoSave',
      'selectField',
      'fontSize',
      'projectPath',
    ])
    expect(result.immediateFields).toEqual(['autoSave'])

    expect(result.validationSchema.parse({
      autoSave: false,
      selectField: 'secondary',
      fontSize: 24,
      projectPath: '/demo',
    })).toEqual({
      autoSave: false,
      selectField: 'secondary',
      fontSize: 24,
      projectPath: '/demo',
    })

    expect(() => result.validationSchema.parse({
      autoSave: true,
      selectField: 'unknown',
      fontSize: 14,
      projectPath: '',
    })).toThrow()

    expect(() => result.validationSchema.parse({
      autoSave: true,
      selectField: 'primary',
      fontSize: 4,
      projectPath: '',
    })).toThrow()
  })

  it('为 select 字段保留完整的值联合类型，而不是默认值字面量', () => {
    const result = defineSettingsSchema({
      general: {
        fields: {
          language: {
            type: 'select',
            default: 'system',
            label: '语言',
            options: [
              { value: 'system', label: '跟随系统' },
              { value: 'en', label: 'English' },
              { value: 'ja', label: '日本語' },
            ],
          },
        },
      },
    } as const)

    expectTypeOf(result.defaults.language).toEqualTypeOf<'system' | 'en' | 'ja'>()
  })

  it('遇到重复字段名时会抛出错误，避免静默覆盖', () => {
    expect(() => defineSettingsSchema({
      general: {
        fields: {
          sharedField: {
            type: 'switch',
            default: true,
            label: '字段 A',
          },
        },
      },
      advanced: {
        fields: {
          sharedField: {
            type: 'switch',
            default: false,
            label: '字段 B',
          },
        },
      },
    } as const)).toThrow('Duplicate settings field name: sharedField')
  })
})
