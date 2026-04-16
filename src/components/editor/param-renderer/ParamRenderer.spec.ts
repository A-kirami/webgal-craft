import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import {
  createBrowserContainerStub,
  createBrowserInputStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { statementEditorSurfaceKey } from '~/features/editor/statement-editor/surface-context'
import { useEditSettingsStore } from '~/stores/edit-settings'

import ParamRenderer from './ParamRenderer.vue'

import type { EditorField, TextField, ValueChoiceField } from '~/features/editor/command-registry/schema'
import type { StatementEditorSurface } from '~/features/editor/statement-editor/surface-context'

function createStandaloneTextField(overrides: Partial<TextField> = {}): EditorField {
  const field: TextField = {
    inlineLayout: 'standalone',
    key: 'text',
    label: 'Dialogue',
    type: 'text',
    variant: { inline: 'textarea-auto', panel: 'textarea-grow' },
    ...overrides,
  }

  return {
    key: 'text',
    storage: 'content',
    field,
  }
}

function createPathChoiceField(): EditorField {
  const field: ValueChoiceField = {
    key: 'expression',
    label: 'Expression',
    options: [],
    placeholder: 'Search expression',
    type: 'choice',
    variant: 'combobox',
    grouping: { mode: 'path' },
  }

  return {
    key: 'expression',
    storage: 'arg',
    field,
    argField: {
      field,
      storageKey: 'expression',
    },
  }
}

function createTextareaStub() {
  return defineComponent({
    name: 'TextareaStub',
    props: {
      id: {
        type: String,
        default: undefined,
      },
      modelValue: {
        type: [Object, Array, Number, String, Boolean],
        default: undefined,
      },
      placeholder: {
        type: String,
        default: undefined,
      },
    },
    emits: ['update:model-value'],
    setup(props, { emit }) {
      return () => h('textarea', {
        'data-testid': props.id ?? 'textarea',
        'id': props.id,
        'placeholder': props.placeholder,
        'value': String(props.modelValue ?? ''),
        'onInput': (event: Event) => emit('update:model-value', (event.target as HTMLTextAreaElement).value),
      })
    },
  })
}

function createParamChoiceFieldProbeStub() {
  return defineComponent({
    name: 'ParamChoiceFieldProbeStub',
    props: {
      comboboxData: {
        type: Object,
        default: undefined,
      },
    },
    setup(props) {
      return () => h('div', {
        'data-testid': 'param-choice-field',
        'data-has-cascading-combobox': props.comboboxData ? 'true' : 'false',
      })
    },
  })
}

const globalStubs = {
  ColorPicker: createBrowserContainerStub('ColorPickerStub'),
  FilePicker: createBrowserContainerStub('FilePickerStub'),
  FocusXYControl: createBrowserContainerStub('FocusXYControlStub'),
  Input: createBrowserInputStub('InputStub'),
  Label: createBrowserContainerStub('LabelStub', 'label'),
  NumberControl: createBrowserContainerStub('NumberControlStub'),
  ParamChoiceField: createBrowserContainerStub('ParamChoiceFieldStub'),
  Switch: createBrowserContainerStub('SwitchStub'),
  Textarea: createTextareaStub(),
}

function renderRenderer(surface: StatementEditorSurface, fieldOverrides: Partial<TextField> = {}) {
  const field = createStandaloneTextField(fieldOverrides)

  return renderInBrowser(ParamRenderer, {
    props: {
      canScrub: () => false,
      fields: [field],
      fileRootPaths: {},
      getDynamicOptions: () => [],
      getFieldSelectValue: () => '',
      getFieldValue: () => '',
      isFieldCustom: () => false,
      isFieldFileMissing: () => false,
      isFieldVisible: () => true,
    },
    global: {
      provide: {
        [statementEditorSurfaceKey]: surface,
      },
      stubs: globalStubs,
    },
  })
}

function renderChoiceRenderer(enableComboboxPathDelimiter: boolean) {
  const field = createPathChoiceField()
  const pinia = createPinia()
  const store = useEditSettingsStore(pinia)
  store.enableComboboxPathDelimiter = enableComboboxPathDelimiter

  return renderInBrowser(ParamRenderer, {
    props: {
      canScrub: () => false,
      fields: [field],
      fileRootPaths: {},
      getDynamicOptions: () => [
        { label: 'sakiko/maskon/kime01', value: 'sakiko/maskon/kime01' },
        { label: 'sakiko/default', value: 'sakiko/default' },
      ],
      getFieldSelectValue: () => '',
      getFieldValue: () => '',
      isFieldCustom: () => false,
      isFieldFileMissing: () => false,
      isFieldVisible: () => true,
    },
    browser: {
      pinia,
    },
    global: {
      provide: {
        [statementEditorSurfaceKey]: 'panel',
      },
      stubs: {
        ...globalStubs,
        ParamChoiceField: createParamChoiceFieldProbeStub(),
      },
    },
  })
}

describe('ParamRenderer', () => {
  it('panel 下 standalone 文本字段显示外部标签且不回退 label 为 placeholder', async () => {
    renderRenderer('panel')

    await expect.element(page.getByText('Dialogue')).toBeInTheDocument()
    await expect.element(page.getByRole('textbox')).toHaveAttribute('placeholder', '')
  })

  it('inline 下 standalone 文本字段隐藏外部标签并回退 label 为 placeholder', async () => {
    renderRenderer('inline')

    await expect.element(page.getByText('Dialogue')).not.toBeInTheDocument()
    await expect.element(page.getByRole('textbox')).toHaveAttribute('placeholder', 'Dialogue')
  })

  it('inline 下 standalone 文本字段保留显式空字符串 placeholder', async () => {
    renderRenderer('inline', { placeholder: '' })

    await expect.element(page.getByText('Dialogue')).not.toBeInTheDocument()
    await expect.element(page.getByRole('textbox')).toHaveAttribute('placeholder', '')
  })

  it('启用路径分隔符时，为 path grouping 字段构建级联 combobox 数据', async () => {
    renderChoiceRenderer(true)

    await expect.element(page.getByTestId('param-choice-field')).toHaveAttribute('data-has-cascading-combobox', 'true')
  })

  it('关闭路径分隔符时，path grouping 字段回退为基础 combobox 数据', async () => {
    renderChoiceRenderer(false)

    await expect.element(page.getByTestId('param-choice-field')).toHaveAttribute('data-has-cascading-combobox', 'false')
  })
})
