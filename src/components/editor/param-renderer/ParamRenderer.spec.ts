import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import {
  createBrowserContainerStub,
  createBrowserInputStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import Autocomplete from '~/components/primitives/Autocomplete.vue'
import { statementEditorSurfaceKey } from '~/features/editor/statement-editor/surface-context'
import { useEditSettingsStore } from '~/stores/edit-settings'
import 'virtual:uno.css'

import ParamRenderer from './ParamRenderer.vue'

import type { PropType } from 'vue'
import type { AutocompleteTextField, EditorField, PlainTextField, ValueChoiceField } from '~/features/editor/command-registry/schema'
import type { ResolvedAutocompleteOption } from '~/features/editor/statement-editor/autocomplete-options'
import type { StatementEditorSurface } from '~/features/editor/statement-editor/surface-context'

const defaultStandaloneTextField = {
  inlineLayout: 'standalone',
  key: 'text',
  label: 'Dialogue',
  type: 'text',
  variant: { inline: 'textarea-auto', panel: 'textarea-grow' },
} satisfies PlainTextField

function requireHtmlElement(element: Element | null | undefined): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new TypeError('expected an HTML element')
  }
  return element
}

function createStandaloneTextField(overrides: Partial<PlainTextField> = {}): EditorField {
  const field: PlainTextField = {
    ...defaultStandaloneTextField,
    ...overrides,
  }

  return {
    key: 'text',
    storage: 'content',
    field,
  }
}

function createStandaloneAutocompleteField(overrides: Partial<AutocompleteTextField> = {}): EditorField {
  const field: AutocompleteTextField = {
    inlineLayout: 'standalone',
    key: 'text',
    label: 'Dialogue',
    type: 'text',
    variant: 'autocomplete',
    autocomplete: [{ type: 'scene', collection: 'figureIds' }],
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
      class: {
        type: [Array, Object, String] as PropType<unknown>,
        default: '',
      },
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
        'class': props.class,
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

function createAutocompleteProbeStub() {
  return defineComponent({
    name: 'AutocompleteProbeStub',
    props: {
      id: {
        type: String,
        default: undefined,
      },
      modelValue: {
        type: String,
        default: '',
      },
      options: {
        type: Array as PropType<{ label: string, value: string }[]>,
        default: () => [],
      },
      placeholder: {
        type: String,
        default: undefined,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('input', {
        'data-testid': 'autocomplete',
        'data-options': props.options.map(option => option.value).join(','),
        'id': props.id,
        'placeholder': props.placeholder,
        'value': props.modelValue,
        'onInput': (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      })
    },
  })
}

const globalStubs = {
  Autocomplete: createAutocompleteProbeStub(),
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

function renderRenderer(surface: StatementEditorSurface, fieldOverrides: Partial<PlainTextField> = {}) {
  const field = createStandaloneTextField(fieldOverrides)

  return renderInBrowser(ParamRenderer, {
    props: {
      canScrub: () => false,
      fields: [field],
      fileRootPaths: {},
      getAutocompleteOptions: () => [],
      getDynamicOptions: () => [],
      getFieldSelectValue: () => '',
      getFieldValue: () => '',
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
      getAutocompleteOptions: () => [],
      getDynamicOptions: () => [
        { label: 'charc/group01/item01', value: 'charc/group01/item01' },
        { label: 'charc/default', value: 'charc/default' },
      ],
      getFieldSelectValue: () => '',
      getFieldValue: () => '',
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

interface RenderAutocompleteOptions {
  field?: EditorField
  onUpdateValue?: (item: { field: EditorField, value: string | number | boolean }) => void
  options?: ResolvedAutocompleteOption[]
  surface?: StatementEditorSurface
  useRealAutocomplete?: boolean
  value?: () => string
}

function renderAutocompleteRenderer(options: RenderAutocompleteOptions = {}) {
  const field = options.field ?? createStandaloneAutocompleteField()

  renderInBrowser(ParamRenderer, {
    props: {
      canScrub: () => false,
      fields: [field],
      fileRootPaths: {},
      getAutocompleteOptions: () => options.options ?? [{ label: 'hero', value: 'hero' }],
      getDynamicOptions: () => [],
      getFieldSelectValue: () => '',
      getFieldValue: () => options.value?.() ?? 'hero',
      isFieldFileMissing: () => false,
      isFieldVisible: () => true,
      onUpdateValue: options.onUpdateValue,
    },
    global: {
      provide: {
        [statementEditorSurfaceKey]: options.surface ?? 'panel',
      },
      stubs: {
        ...globalStubs,
        ...(options.useRealAutocomplete ? { Autocomplete } : {}),
      },
    },
  })

  return field
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

  it('textarea stub 显式转发调用方样式类', async () => {
    renderRenderer('inline', { className: 'min-w-20' })

    await expect.element(page.getByRole('textbox')).toHaveClass('min-w-20')
  })

  it('启用路径分隔符时，为 path grouping 字段构建级联 combobox 数据', async () => {
    renderChoiceRenderer(true)

    await expect.element(page.getByTestId('param-choice-field')).toHaveAttribute('data-has-cascading-combobox', 'true')
  })

  it('关闭路径分隔符时，path grouping 字段回退为基础 combobox 数据', async () => {
    renderChoiceRenderer(false)

    await expect.element(page.getByTestId('param-choice-field')).toHaveAttribute('data-has-cascading-combobox', 'false')
  })

  it('普通文本 autocomplete 字段渲染 Autocomplete 并保留自由输入', async () => {
    const handleUpdateValue = vi.fn()
    const field = renderAutocompleteRenderer({ onUpdateValue: handleUpdateValue })

    const autocomplete = page.getByTestId('autocomplete')
    await expect.element(autocomplete).toHaveAttribute('data-options', 'hero')

    await autocomplete.fill('new-hero')

    expect(handleUpdateValue).toHaveBeenCalledWith({ field, value: 'new-hero' })
  })

  it('inline autocomplete 的下拉指示器可见且保持在输入框边界内', async () => {
    const field = createStandaloneAutocompleteField({ className: 'min-w-20', inlineLayout: undefined })
    renderAutocompleteRenderer({
      field,
      options: [{ label: '雨', value: '雨' }],
      surface: 'inline',
      useRealAutocomplete: true,
      value: () => '雨',
    })

    const autocomplete = requireHtmlElement(await page.getByRole('combobox').element())
    const indicator = requireHtmlElement(await page.getByTestId('autocomplete-indicator').element())

    const inputRect = autocomplete.getBoundingClientRect()
    const indicatorRect = indicator.getBoundingClientRect()
    expect(indicatorRect.width).toBeGreaterThan(0)
    expect(indicatorRect.height).toBeGreaterThan(0)
    expect(indicatorRect.left).toBeGreaterThanOrEqual(inputRect.left - 1)
    expect(indicatorRect.right).toBeLessThanOrEqual(inputRect.right + 1)
  })
})
