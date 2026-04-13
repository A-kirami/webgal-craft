import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import {
  createBrowserContainerStub,
  createBrowserInputStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { statementEditorSurfaceKey } from '~/features/editor/statement-editor/surface-context'

import ParamRenderer from './ParamRenderer.vue'

import type { EditorField, TextField } from '~/features/editor/command-registry/schema'
import type { StatementEditorSurface } from '~/features/editor/statement-editor/surface-context'

function createStandaloneTextField(): EditorField {
  const field: TextField = {
    inlineLayout: 'standalone',
    key: 'text',
    label: 'Dialogue',
    type: 'text',
    variant: { inline: 'textarea-auto', panel: 'textarea-grow' },
  }

  return {
    key: 'text',
    storage: 'content',
    field,
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

function renderRenderer(surface: StatementEditorSurface) {
  const field = createStandaloneTextField()

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
})
