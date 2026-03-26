import { describe, expect, it } from 'vitest'

import { useParamFieldMeta } from './useParamFieldMeta'

import type { EditorField } from '~/helper/command-registry/schema'

type StatementSchemaParamMode = 'all' | 'basic' | 'advanced'

function createField(field: EditorField['field'], storage: EditorField['storage'] = 'arg'): EditorField {
  return {
    key: field.key,
    field,
    storage,
  } as EditorField
}

function createMeta(mode: StatementSchemaParamMode = 'all') {
  return useParamFieldMeta({
    i18nContent: () => '',
    mode: () => mode,
    surface: () => 'panel',
    t: key => key,
  })
}

describe('useParamFieldMeta', () => {
  it('按 mode 过滤可见字段并保留 isFieldVisible 语义', () => {
    const basicField = createField({
      key: 'speed',
      label: 'Speed',
      type: 'number',
    })
    const advancedField = createField({
      advanced: true,
      key: 'easing',
      label: 'Easing',
      type: 'text',
    })

    const allMeta = createMeta('all')
    const basicMeta = createMeta('basic')
    const advancedMeta = createMeta('advanced')

    const onlyVisibleBasic = (field: EditorField) => field.key === 'speed'

    expect(allMeta.filterVisibleFields([basicField, advancedField], onlyVisibleBasic)).toEqual([basicField])
    expect(basicMeta.filterVisibleFields([basicField, advancedField], () => true)).toEqual([basicField])
    expect(advancedMeta.filterVisibleFields([basicField, advancedField], () => true)).toEqual([advancedField])
  })

  it('解析字段模式与布局规则', () => {
    const meta = createMeta()

    const numberWithUnit = createField({
      key: 'duration',
      label: 'Duration',
      type: 'number',
      unit: 'ms',
    })
    const textAreaGrow = createField({
      key: 'desc',
      label: 'Desc',
      type: 'text',
      variant: { inline: 'input', panel: 'textarea-grow' },
    })
    const combobox = createField({
      key: 'target',
      label: 'Target',
      options: [],
      type: 'choice',
      variant: { inline: 'select', panel: 'combobox' },
    })
    const switchField = createField({
      key: 'next',
      label: 'Next',
      type: 'switch',
    })

    expect(meta.fieldMode(numberWithUnit)).toBe('numberWithUnit')
    expect(meta.fieldMode(textAreaGrow)).toBe('textareaGrow')
    expect(meta.fieldMode(combobox)).toBe('combobox')
    expect(meta.fieldMode(switchField)).toBe('switch')

    expect(meta.fieldLayout(switchField, false)).toBe('row')
    expect(meta.fieldLayout(textAreaGrow, false)).toBe('column')
    expect(meta.fieldLayout(textAreaGrow, true)).toBe('row')
  })

  it('inputAutoWidth 仅在 input 形态下生效', () => {
    const meta = createMeta()
    const textInput = createField({
      inputAutoWidth: true,
      key: 'speaker',
      label: 'Speaker',
      type: 'text',
      variant: 'input',
    })
    const textArea = createField({
      inputAutoWidth: true,
      key: 'line',
      label: 'Line',
      type: 'text',
      variant: 'textarea-auto',
    })
    const numberInput = createField({
      inputAutoWidth: true,
      key: 'x',
      label: 'X',
      type: 'number',
      variant: 'input',
    })
    const numberUnit = createField({
      inputAutoWidth: true,
      key: 'duration',
      label: 'Duration',
      type: 'number',
      unit: 'ms',
      variant: 'input-with-unit',
    })

    expect(meta.shouldUseInputAutoWidth(textInput)).toBe(true)
    expect(meta.shouldUseInputAutoWidth(textArea)).toBe(false)
    expect(meta.shouldUseInputAutoWidth(numberInput)).toBe(true)
    expect(meta.shouldUseInputAutoWidth(numberUnit)).toBe(false)
  })

  it('解析 placeholder/customLabel/unit/fileTitle 与 switch model 值', () => {
    const meta = createMeta()
    const choiceField = createField({
      customLabel: 'Custom target',
      key: 'target',
      label: 'Target',
      options: [],
      placeholder: 'Select target',
      type: 'choice',
    })
    const numberField = createField({
      key: 'duration',
      label: 'Duration',
      type: 'number',
      unit: 'ms',
    })
    const fileField = createField({
      fileConfig: {
        assetType: 'bg',
        extensions: ['png'],
        title: 'Choose file',
      },
      key: 'asset',
      label: 'Asset',
      type: 'file',
    })
    const contentSwitch = createField({
      key: 'next',
      label: 'Next',
      onValue: 'continue',
      type: 'switch',
    }, 'content')
    const argSwitch = createField({
      key: 'instant',
      label: 'Instant',
      type: 'switch',
    })

    expect(meta.placeholder(choiceField)).toBe('Select target')
    expect(meta.customLabel(choiceField)).toBe('Custom target')
    expect(meta.unitLabel(numberField)).toBe('ms')
    expect(meta.fileTitle(fileField)).toBe('Choose file')
    expect(meta.switchModelValue(contentSwitch, 'continue')).toBe(true)
    expect(meta.switchModelValue(contentSwitch, 'stop')).toBe(false)
    expect(meta.switchModelValue(argSwitch, true)).toBe(true)
  })
})
