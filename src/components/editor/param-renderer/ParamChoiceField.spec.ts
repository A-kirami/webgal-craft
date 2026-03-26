import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserActionStub,
  createBrowserContainerStub,
  createBrowserTextStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import ParamChoiceField from './ParamChoiceField.vue'

import type { ParamSelectOptionItem } from './controls/types'
import type { ArgEditorField, ValueChoiceField } from '~/features/editor/command-registry/schema'

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
  return createBrowserActionStub('SelectStub', {
    eventName: 'update:model-value',
    includeDefaultSlot: true,
    payload: 42,
    testId: 'select-update',
    text: 'emit select',
  })
}

function createComboboxStub() {
  return createBrowserActionStub('ComboboxStub', {
    eventName: 'update:model-value',
    payload: 77,
    testId: 'combobox-update',
    text: 'emit combobox',
  })
}

function createSegmentedStub() {
  return createBrowserActionStub('SegmentedControlStub', {
    eventName: 'update-select',
    payload: 99,
    testId: 'segmented-update',
    text: 'emit segmented',
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
  Label: createBrowserContainerStub('LabelStub', 'label'),
  SegmentedControl: createSegmentedStub(),
  Select: createSelectStub(),
  SelectContent: createBrowserContainerStub('SelectContentStub'),
  SelectItem: createBrowserContainerStub('SelectItemStub'),
  SelectTrigger: createBrowserContainerStub('SelectTriggerStub', 'button'),
  SelectValue: createBrowserTextStub('SelectValueStub', 'SelectValue', 'span'),
}

const baseOptions: ParamSelectOptionItem[] = [{ label: 'Hero', value: 'hero' }]

describe('ParamChoiceField', () => {
  it('segmented 选择会归一化后触发 updateSelect', async () => {
    const onUpdateSelect = vi.fn()

    renderInBrowser(ParamChoiceField, {
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

    renderInBrowser(ParamChoiceField, {
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

    renderInBrowser(ParamChoiceField, {
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

    renderInBrowser(ParamChoiceField, {
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
    renderInBrowser(ParamChoiceField, {
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
