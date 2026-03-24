/* eslint-disable vue/one-component-per-file */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

import { createBrowserTestI18n } from '~/__tests__/browser'

const {
  useCommandPanelStoreMock,
  useEffectEditorDialogMock,
  useModalStoreMock,
  useStatementAnimationDialogMock,
} = vi.hoisted(() => ({
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
  commandEntries: [],
  commandPanelCategories: [],
  getCategoryLabel: () => 'Effect',
  getFactoryDefaultCommandText: () => 'setTempAnimation:[{"duration":0}];',
}))

vi.mock('~/helper/webgal-script/sentence', async importOriginal => ({
  ...(await importOriginal<typeof import('~/helper/webgal-script/sentence')>()),
  buildSingleStatement: (rawText: string) => ({
    id: rawText.length,
    parsed: undefined,
    parseError: false,
    rawText,
  }),
}))

vi.mock('~/stores/command-panel', () => ({
  useCommandPanelStore: useCommandPanelStoreMock,
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/utils/speaker', async importOriginal => ({
  ...(await importOriginal<typeof import('~/utils/speaker')>()),
  buildPreviousSpeakers: () => [''],
}))

import StatementGroupModal from './StatementGroupModal.vue'

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
  ScrollArea: defineComponent({
    name: 'StubScrollArea',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  StatementAnimationSubDialog: defineComponent({
    name: 'StubStatementAnimationSubDialog',
    setup() {
      return () => h('div', 'Statement Animation Sub Dialog')
    },
  }),
  VisualEditorStatementCard: defineComponent({
    name: 'StubVisualEditorStatementCard',
    setup() {
      return () => h('div', 'Visual Editor Statement Card')
    },
  }),
}

describe('StatementGroupModal', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    useCommandPanelStoreMock.mockReset()
    useEffectEditorDialogMock.mockReset()
    useModalStoreMock.mockReset()
    useStatementAnimationDialogMock.mockReset()

    useCommandPanelStoreMock.mockReturnValue({
      saveGroup: vi.fn(),
    })
    useEffectEditorDialogMock.mockReturnValue(effectDialogState)
    useModalStoreMock.mockReturnValue({
      open: vi.fn(),
    })
    useStatementAnimationDialogMock.mockReturnValue(animationDialogState)
  })

  it('在语句组弹窗中接入动画编辑器子对话框 provider', async () => {
    render(StatementGroupModal, {
      props: {
        group: {
          createdAt: Date.parse('2026-03-23T00:00:00Z'),
          id: 'group-1',
          name: 'Group 1',
          rawTexts: ['setTempAnimation:[{"duration":0}];'],
        },
        open: true,
      },
      global: {
        plugins: [createBrowserTestI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('Visual Editor Statement Card')).toBeInTheDocument()
    await expect.element(page.getByText('Statement Animation Sub Dialog')).toBeInTheDocument()
    expect(useStatementAnimationDialogMock).toHaveBeenCalledTimes(1)
  })
})
