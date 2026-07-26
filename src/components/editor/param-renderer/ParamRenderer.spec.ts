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
import Switch from '~/components/ui/switch/Switch.vue'
import { statementEditorSurfaceKey } from '~/features/editor/statement-editor/surface-context'
import { useEditSettingsStore } from '~/stores/edit-settings'
import 'virtual:uno.css'

import NumberControl from './controls/NumberControl.vue'
import ParamChoiceField from './ParamChoiceField.vue'
import ParamRenderer from './ParamRenderer.vue'

import type { PropType } from 'vue'
import type { ResolvedAutocompleteOption } from '~/features/editor/command-registry/autocomplete-options'
import type { AutocompleteTextField, EditorField, FileField, NumberField, PlainTextField, SwitchField, ValueChoiceField } from '~/features/editor/command-registry/schema'
import type { EditorFieldDiagnostic } from '~/features/editor/diagnostics/types'
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

function createSwitchField(key: string = 'enabled'): EditorField {
  const field: SwitchField = {
    key,
    label: 'Enabled',
    tooltip: {
      on: 'The next statement runs immediately.',
      off: 'The next statement waits for the current effect.',
    },
    type: 'switch',
  }

  return {
    key,
    storage: 'arg',
    field,
    argField: {
      field,
      storageKey: key,
    },
  }
}

function createNumberField(): EditorField {
  const field: NumberField = {
    key: 'time',
    label: 'Time',
    type: 'number',
    unit: 'ms',
  }
  return { key: 'time', storage: 'content', field }
}

function createFileField(): EditorField {
  const field: FileField = {
    key: 'file',
    label: 'File',
    type: 'file',
    fileConfig: {
      assetType: 'figure',
      extensions: ['.png', '.json'],
      title: 'Figure',
    },
  }
  return { key: 'file', storage: 'content', field }
}

const warningDiagnostic: EditorFieldDiagnostic = {
  code: 'duplicate-label',
  count: 2,
  field: { kind: 'content' },
  label: 'start',
  severity: 'warning',
  source: 'scene',
}

const errorDiagnostic: EditorFieldDiagnostic = {
  code: 'missing-label',
  field: { kind: 'content' },
  label: 'missing',
  severity: 'error',
  source: 'scene',
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

function createFilePickerProbeStub() {
  return defineComponent({
    name: 'FilePickerProbeStub',
    props: {
      status: {
        type: String,
        default: 'none',
      },
    },
    setup(props) {
      return () => h('input', {
        'data-status': props.status,
        'data-testid': 'file-picker',
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

const statementTooltipProbe = defineComponent({
  name: 'StatementTooltipProbe',
  props: {
    description: {
      type: String,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    return () => h('div', {
      'data-testid': 'param-field-tooltip',
      'data-description': props.description,
    }, slots.default?.())
  },
})

type BrowserRenderOptions = NonNullable<Parameters<typeof renderInBrowser>[1]>
type BrowserStubs = NonNullable<NonNullable<BrowserRenderOptions['global']>['stubs']>

function renderFieldRenderer(
  surface: StatementEditorSurface,
  field: EditorField,
  stubs: BrowserStubs = globalStubs,
  diagnostics: readonly EditorFieldDiagnostic[] = [],
) {
  return renderInBrowser(ParamRenderer, {
    props: {
      canScrub: () => false,
      fields: [field],
      fileRootPaths: {},
      getAutocompleteOptions: () => [],
      getDynamicOptions: () => [],
      getFieldSelectValue: () => '',
      getFieldValue: () => '',
      getFieldDiagnostics: () => diagnostics,
      isFieldVisible: () => true,
    },
    global: {
      provide: {
        [statementEditorSurfaceKey]: surface,
      },
      stubs,
    },
  })
}

function renderRenderer(surface: StatementEditorSurface, fieldOverrides: Partial<PlainTextField> = {}) {
  return renderFieldRenderer(surface, createStandaloneTextField(fieldOverrides))
}

function renderChoiceRenderer(
  enableComboboxPathDelimiter: boolean,
  useRealControl: boolean = false,
  diagnostics: readonly EditorFieldDiagnostic[] = [],
) {
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
      getFieldDiagnostics: () => diagnostics,
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
        ParamChoiceField: useRealControl ? ParamChoiceField : createParamChoiceFieldProbeStub(),
      },
    },
  })
}

interface RenderAutocompleteOptions {
  field?: EditorField
  onUpdateValue?: (item: { field: EditorField, value: string | number | boolean }) => void
  diagnostics?: readonly EditorFieldDiagnostic[]
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
      getFieldDiagnostics: () => options.diagnostics ?? [],
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

    const label = page.getByText('Dialogue')
    const textbox = page.getByRole('textbox')
    await expect.element(label).toBeInTheDocument()
    await expect.element(textbox).toHaveAttribute('placeholder', '')

    const trigger = document.querySelector('[data-statement-diagnostic-trigger]')
    expect(trigger).toContain(textbox.element())
    expect(trigger).not.toContain(label.element())
    expect(trigger).toHaveClass('w-full', 'flex-col')
  })

  it('panel 下 switch 的诊断锚点与控件等宽且不占满字段', () => {
    renderFieldRenderer('panel', createSwitchField(), {
      ...globalStubs,
      Switch,
    })

    const trigger = requireHtmlElement(document.querySelector('[data-statement-diagnostic-trigger]'))
    const field = requireHtmlElement(trigger.closest('[data-layout="row"]'))
    const control = requireHtmlElement(document.querySelector('[role="switch"]'))
    expect(trigger.getBoundingClientRect().width).toBeCloseTo(control.getBoundingClientRect().width, 0)
    expect(trigger.getBoundingClientRect().width).toBeLessThan(field.getBoundingClientRect().width)
  })

  it('switch tooltip 按当前开关状态展示对应效果', () => {
    renderInBrowser(ParamRenderer, {
      props: {
        canScrub: () => false,
        fields: [createSwitchField('disabled'), createSwitchField('enabled')],
        fileRootPaths: {},
        getAutocompleteOptions: () => [],
        getDynamicOptions: () => [],
        getFieldSelectValue: () => '',
        getFieldValue: (field: EditorField) => field.key === 'enabled',
        getFieldDiagnostics: () => [],
        isFieldVisible: () => true,
      },
      global: {
        provide: {
          [statementEditorSurfaceKey]: 'panel',
        },
        stubs: {
          ...globalStubs,
          StatementDiagnosticTooltip: statementTooltipProbe,
        },
      },
    })

    const descriptions = [...document.querySelectorAll<HTMLElement>('[data-testid="param-field-tooltip"]')]
      .map(element => element.dataset.description)
    expect(descriptions).toEqual([
      'The next statement waits for the current effect.',
      'The next statement runs immediately.',
    ])
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

    const control = page.getByTestId('param-choice-field')
    await expect.element(control).toHaveAttribute('data-has-cascading-combobox', 'true')
  })

  it('关闭路径分隔符时，path grouping 字段回退为基础 combobox 数据', async () => {
    renderChoiceRenderer(false)

    await expect.element(page.getByTestId('param-choice-field')).toHaveAttribute('data-has-cascading-combobox', 'false')
  })

  it('panel 下 choice 控件占满诊断锚点', async () => {
    renderChoiceRenderer(true, true)

    const trigger = requireHtmlElement(document.querySelector('[data-statement-diagnostic-trigger]'))
    const choice = requireHtmlElement(await page.getByRole('combobox').element())
    expect(choice.getBoundingClientRect().width).toBeCloseTo(trigger.getBoundingClientRect().width, 0)
  })

  it('error combobox 使用 destructive 状态样式', async () => {
    renderChoiceRenderer(true, true, [errorDiagnostic])

    await expect.element(page.getByRole('combobox')).toHaveClass(
      'text-destructive!',
      'bg-destructive/5',
      'border-destructive/50',
      'focus-visible:ring-destructive/30',
    )
  })

  it('panel 下 number 控件占满诊断锚点', () => {
    renderFieldRenderer('panel', createNumberField(), {
      ...globalStubs,
      NumberControl,
    })

    const trigger = requireHtmlElement(document.querySelector('[data-statement-diagnostic-trigger]'))
    const number = requireHtmlElement(document.querySelector('[data-slot="input-group"]'))
    expect(number.getBoundingClientRect().width).toBeCloseTo(trigger.getBoundingClientRect().width, 0)
  })

  it('普通文本 autocomplete 字段渲染 Autocomplete 并保留自由输入', async () => {
    const handleUpdateValue = vi.fn()
    const field = renderAutocompleteRenderer({ onUpdateValue: handleUpdateValue })

    const autocomplete = page.getByTestId('autocomplete')
    await expect.element(autocomplete).toHaveAttribute('data-options', 'hero')

    await autocomplete.fill('new-hero')

    expect(handleUpdateValue).toHaveBeenCalledWith({ field, value: 'new-hero' })
  })

  it('warning autocomplete 使用与 destructive 同层级的黄色状态样式', async () => {
    renderAutocompleteRenderer({ diagnostics: [warningDiagnostic], useRealAutocomplete: true })

    const autocomplete = page.getByRole('combobox')
    await expect.element(autocomplete).toHaveClass(
      'text-yellow-700!',
      'bg-yellow/5',
      'border-yellow/50',
      'focus-visible:ring-yellow/30',
    )
    await expect.element(autocomplete).not.toHaveClass('text-destructive!')
  })

  it('warning 文件字段向 FilePicker 传递 warning 状态', async () => {
    renderFieldRenderer('panel', createFileField(), {
      ...globalStubs,
      FilePicker: createFilePickerProbeStub(),
    }, [warningDiagnostic])

    await expect.element(page.getByTestId('file-picker')).toHaveAttribute('data-status', 'warning')
  })

  it('error autocomplete 使用 destructive 状态样式', async () => {
    renderAutocompleteRenderer({ diagnostics: [errorDiagnostic], useRealAutocomplete: true })

    const autocomplete = page.getByRole('combobox')
    await expect.element(autocomplete).toHaveClass('text-destructive!')
  })
})
