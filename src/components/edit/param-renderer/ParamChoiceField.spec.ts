/* eslint-disable vue/one-component-per-file */
import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

import ParamChoiceField from './ParamChoiceField.vue'

import type { ParamSelectOptionItem } from './controls/types'
import type { ArgEditorField, ValueChoiceField } from '~/helper/command-registry/schema'

function createChoiceField(): ArgEditorField {
  const field: ValueChoiceField = {
    customizable: true,
    key: 'target',
    label: 'Target',
    options: [],
    type: 'choice',
  }

  return {
    key: 'target',
    storage: 'arg',
    field,
    argField: {
      field,
      storageKey: 'target',
    },
  }
}

function createSelectStub() {
  return defineComponent({
    name: 'SelectStub',
    emits: ['update:model-value'],
    setup(_props, { emit, slots }) {
      return () => h('div', { 'data-testid': 'select-control' }, [
        h('button', {
          'data-testid': 'select-update',
          'type': 'button',
          'onClick': () => emit('update:model-value', 42),
        }, 'emit select'),
        slots.default?.(),
      ])
    },
  })
}

function createComboboxStub() {
  return defineComponent({
    name: 'ComboboxStub',
    emits: ['update:model-value'],
    setup(_props, { emit }) {
      return () => h('button', {
        'data-testid': 'combobox-update',
        'type': 'button',
        'onClick': () => emit('update:model-value', 77),
      }, 'emit combobox')
    },
  })
}

function createSegmentedStub() {
  return defineComponent({
    name: 'SegmentedControlStub',
    emits: ['update-select'],
    setup(_props, { emit }) {
      return () => h('button', {
        'data-testid': 'segmented-update',
        'type': 'button',
        'onClick': () => emit('update-select', 99),
      }, 'emit segmented')
    },
  })
}

function createInputStub() {
  return defineComponent({
    name: 'InputStub',
    props: {
      id: {
        type: String,
        default: undefined,
      },
      modelValue: {
        type: [String, Number, Boolean],
        default: '',
      },
    },
    emits: ['update:model-value'],
    setup(props, { emit }) {
      return () => h('input', {
        'data-testid': props.id ? `${props.id}-input` : 'custom-input',
        'id': props.id,
        'value': String(props.modelValue ?? ''),
        'onInput': (event: Event) => {
          emit('update:model-value', (event.target as HTMLInputElement).value)
        },
      })
    },
  })
}

const globalStubs = {
  Combobox: createComboboxStub(),
  Input: createInputStub(),
  Label: defineComponent({
    name: 'LabelStub',
    setup(_props, { slots }) {
      return () => h('label', slots.default?.())
    },
  }),
  SegmentedControl: createSegmentedStub(),
  Select: createSelectStub(),
  SelectContent: defineComponent({
    name: 'SelectContentStub',
    setup(_props, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  SelectItem: defineComponent({
    name: 'SelectItemStub',
    setup(_props, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  SelectTrigger: defineComponent({
    name: 'SelectTriggerStub',
    setup(_props, { slots }) {
      return () => h('button', { type: 'button' }, slots.default?.())
    },
  }),
  SelectValue: defineComponent({
    name: 'SelectValueStub',
    setup() {
      return () => h('span', 'SelectValue')
    },
  }),
}

const baseOptions: ParamSelectOptionItem[] = [{ label: 'Hero', value: 'hero' }]

describe('ParamChoiceField', () => {
  it('segmented 选择会归一化后触发 updateSelect', async () => {
    const onUpdateSelect = vi.fn()

    render(ParamChoiceField, {
      props: {
        customInputId: 'target-custom-input',
        customOptionLabel: 'Custom',
        field: createChoiceField(),
        inputId: 'target-input',
        isCustomField: false,
        mode: 'select',
        notSelectedLabel: 'Not selected',
        options: baseOptions,
        placeholder: 'Select target',
        renderSegmented: true,
        selectValue: '',
        surface: 'panel',
        value: '',
        onUpdateSelect,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('segmented-update').click()
    expect(onUpdateSelect).toHaveBeenCalledWith('99')
  })

  it('select 分支会透传并归一化 updateSelect', async () => {
    const onUpdateSelect = vi.fn()

    render(ParamChoiceField, {
      props: {
        customInputId: 'target-custom-input',
        customOptionLabel: 'Custom',
        field: createChoiceField(),
        inputId: 'target-input',
        isCustomField: false,
        mode: 'select',
        notSelectedLabel: 'Not selected',
        options: baseOptions,
        placeholder: 'Select target',
        renderSegmented: false,
        selectValue: '',
        surface: 'panel',
        value: '',
        onUpdateSelect,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('select-update').click()
    expect(onUpdateSelect).toHaveBeenCalledWith('42')
  })

  it('combobox 分支会透传并归一化 updateSelect', async () => {
    const onUpdateSelect = vi.fn()

    render(ParamChoiceField, {
      props: {
        customInputId: 'target-custom-input',
        customOptionLabel: 'Custom',
        field: createChoiceField(),
        inputId: 'target-input',
        isCustomField: false,
        mode: 'combobox',
        notSelectedLabel: 'Not selected',
        options: baseOptions,
        placeholder: 'Search target',
        renderSegmented: false,
        selectValue: '',
        surface: 'panel',
        value: '',
        onUpdateSelect,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('combobox-update').click()
    expect(onUpdateSelect).toHaveBeenCalledWith('77')
  })

  it('custom 模式显示自定义输入并触发 updateValue', async () => {
    const onUpdateValue = vi.fn()

    render(ParamChoiceField, {
      props: {
        customLabel: 'Custom target',
        customInputId: 'target-custom-input',
        customOptionLabel: 'Custom',
        field: createChoiceField(),
        inputId: 'target-input',
        isCustomField: true,
        mode: 'select',
        notSelectedLabel: 'Not selected',
        options: baseOptions,
        placeholder: 'Select target',
        renderSegmented: false,
        selectValue: '__custom__',
        surface: 'panel',
        value: '',
        onUpdateValue,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('target-custom-input-input').fill('  custom-target  ')
    expect(onUpdateValue).toHaveBeenLastCalledWith('  custom-target  ')
  })

  it('custom 模式会保留 0 这类有效假值', async () => {
    render(ParamChoiceField, {
      props: {
        customLabel: 'Custom target',
        customInputId: 'target-custom-input',
        customOptionLabel: 'Custom',
        field: createChoiceField(),
        inputId: 'target-input',
        isCustomField: true,
        mode: 'select',
        notSelectedLabel: 'Not selected',
        options: baseOptions,
        placeholder: 'Select target',
        renderSegmented: false,
        selectValue: '__custom__',
        surface: 'panel',
        value: 0,
        onUpdateValue: vi.fn(),
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('target-custom-input-input')).toHaveAttribute('value', '0')
  })
})
