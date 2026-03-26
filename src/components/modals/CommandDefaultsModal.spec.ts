/* eslint-disable vue/one-component-per-file */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { createBrowserLiteI18n } from '~/__tests__/browser'

const {
  buildSingleStatementMock,
  useCommandPanelStoreMock,
  useEffectEditorDialogMock,
  useModalStoreMock,
  useStatementAnimationDialogMock,
} = vi.hoisted(() => ({
  buildSingleStatementMock: vi.fn(),
  useCommandPanelStoreMock: vi.fn(),
  useEffectEditorDialogMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  useStatementAnimationDialogMock: vi.fn(),
}))

vi.mock('~/composables/useEffectEditorDialog', () => ({
  useEffectEditorDialog: useEffectEditorDialogMock,
}))

vi.mock('~/composables/useStatementAnimationDialog', () => ({
  useStatementAnimationDialog: useStatementAnimationDialogMock,
}))
vi.mock('~/helper/command-registry/index', async importOriginal => ({
  ...(await importOriginal<typeof import('~/helper/command-registry/index')>()),
  getCommandConfig: () => ({
    label: 'setTempAnimation',
  }),
  getCommandDescription: () => 'setTempAnimation description',
  getFactoryDefaultCommandText: () => 'setTempAnimation:[{"duration":0}];',
}))

vi.mock('~/helper/webgal-script/sentence', async importOriginal => ({
  ...(await importOriginal<typeof import('~/helper/webgal-script/sentence')>()),
  buildSingleStatement: buildSingleStatementMock,
}))

vi.mock('~/stores/command-panel', () => ({
  useCommandPanelStore: useCommandPanelStoreMock,
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

import CommandDefaultsModal from './CommandDefaultsModal.vue'

const effectDialogState = {
  draftDuration: '',
  draftEase: '',
  draftTransform: {},
  handleApply: vi.fn(),
  handleTransformUpdate: vi.fn(),
  isDefault: true,
  isDirty: false,
  isOpen: false,
  requestClose: vi.fn(),
  resetToDefault: vi.fn(),
  updateDuration: vi.fn(),
  updateEase: vi.fn(),
}

const animationDialogState = {
  draftFrames: [],
  handleApply: vi.fn(),
  isDefault: true,
  isDirty: false,
  isOpen: false,
  requestClose: vi.fn(),
  resetToDefault: vi.fn(),
  updateFrames: vi.fn(),
}

const globalStubs = {
  Button: defineComponent({
    name: 'StubButton',
    emits: ['click'],
    setup(_, { attrs, emit, slots }) {
      return () => h('button', {
        ...attrs,
        type: 'button',
        onClick: (event: MouseEvent) => emit('click', event),
      }, slots.default?.())
    },
  }),
  Dialog: defineComponent({
    name: 'StubDialog',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DialogDescription: defineComponent({
    name: 'StubDialogDescription',
    setup(_, { slots }) {
      return () => h('p', slots.default?.())
    },
  }),
  DialogFooter: defineComponent({
    name: 'StubDialogFooter',
    setup(_, { slots }) {
      return () => h('footer', slots.default?.())
    },
  }),
  DialogHeader: defineComponent({
    name: 'StubDialogHeader',
    setup(_, { slots }) {
      return () => h('header', slots.default?.())
    },
  }),
  DialogScrollContent: defineComponent({
    name: 'StubDialogScrollContent',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DialogTitle: defineComponent({
    name: 'StubDialogTitle',
    setup(_, { slots }) {
      return () => h('h2', slots.default?.())
    },
  }),
  EffectEditorSubDialog: defineComponent({
    name: 'StubEffectEditorSubDialog',
    setup() {
      return () => h('div', 'Effect Editor Sub Dialog')
    },
  }),
  Input: defineComponent({
    name: 'StubInput',
    props: {
      modelValue: {
        default: '',
        type: String,
        required: false,
      },
      placeholder: {
        default: '',
        type: String,
        required: false,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('input', {
        placeholder: props.placeholder,
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      })
    },
  }),
  StatementAnimationSubDialog: defineComponent({
    name: 'StubStatementAnimationSubDialog',
    setup() {
      return () => h('div', 'Statement Animation Sub Dialog')
    },
  }),
  StatementEditorPanel: defineComponent({
    name: 'StubStatementEditorPanel',
    setup() {
      return () => h('div', 'Statement Editor Panel')
    },
  }),
}

describe('CommandDefaultsModal', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    buildSingleStatementMock.mockReset()
    useCommandPanelStoreMock.mockReset()
    useEffectEditorDialogMock.mockReset()
    useModalStoreMock.mockReset()
    useStatementAnimationDialogMock.mockReset()

    buildSingleStatementMock.mockReturnValue({
      id: 1,
      parsed: undefined,
      parseError: false,
      rawText: 'setTempAnimation:[{"duration":0}];',
    })
    useCommandPanelStoreMock.mockReturnValue({
      getInsertText: vi.fn(() => 'setTempAnimation:[{"duration":0}];'),
      resetDefault: vi.fn(),
      saveDefault: vi.fn(),
    })
    useEffectEditorDialogMock.mockReturnValue(effectDialogState)
    useModalStoreMock.mockReturnValue({
      open: vi.fn(),
    })
    useStatementAnimationDialogMock.mockReturnValue(animationDialogState)
  })

  it('在命令默认值弹窗中接入动画编辑器子对话框提供器', async () => {
    render(CommandDefaultsModal, {
      props: {
        open: true,
        type: commandType.setTempAnimation,
      },
      global: {
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('Statement Editor Panel')).toBeInTheDocument()
    await expect.element(page.getByText('Statement Animation Sub Dialog')).toBeInTheDocument()
    expect(useStatementAnimationDialogMock).toHaveBeenCalledTimes(1)
  })
})
