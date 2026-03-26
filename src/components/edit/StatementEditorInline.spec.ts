/* eslint-disable vue/one-component-per-file, vue/require-default-prop */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { computed, defineComponent, h } from 'vue'

import { createBrowserLiteI18n } from '~/__tests__/browser'

const {
  handleCommentChangeMock,
  handleInlineCommentChangeMock,
  handleRawTextChangeMock,
  handleSpeakerChangeMock,
  toggleNarrationModeMock,
  useStatementEditorMock,
} = vi.hoisted(() => ({
  handleCommentChangeMock: vi.fn(),
  handleInlineCommentChangeMock: vi.fn(),
  handleRawTextChangeMock: vi.fn(),
  handleSpeakerChangeMock: vi.fn(),
  toggleNarrationModeMock: vi.fn(),
  useStatementEditorMock: vi.fn(),
}))

vi.mock('~/composables/useStatementEditor', async importOriginal => ({
  ...(await importOriginal<typeof import('~/composables/useStatementEditor')>()),
  isStatementInteractiveTarget: () => false,
  useStatementEditor: useStatementEditorMock,
}))

import StatementEditorInline from './StatementEditorInline.vue'

import type { StatementEntry } from '~/helper/webgal-script/sentence'

function createEditorReturn(overrides: Record<string, unknown> = {}) {
  return {
    parsed: computed(() => ({
      command: 'say',
      content: '',
      inlineComment: '',
    })),
    statementType: 'say',
    resource: {
      fileRootPaths: computed(() => ({})),
    },
    hasVisibleAdvancedParams: false,
    content: {
      specialContent: {
        choose: { value: [] },
        handleAddChooseItem: vi.fn(),
        handleChooseFileChange: vi.fn(),
        handleChooseNameChange: vi.fn(),
        handleRemoveChooseItem: vi.fn(),
        handleSetVarNameChange: vi.fn(),
        handleSetVarValueChange: vi.fn(),
        handleStyleNewNameChange: vi.fn(),
        handleStyleOldNameChange: vi.fn(),
        handleAddStyleRule: vi.fn(),
        handleRemoveStyleRule: vi.fn(),
        setVar: { value: {} },
        styleRules: { value: [] },
      },
    },
    misc: {
      handleCommentChange: handleCommentChangeMock,
      handleInlineCommentChange: handleInlineCommentChangeMock,
      handleRawTextChange: handleRawTextChangeMock,
    },
    say: {
      effectiveSpeaker: 'Alice',
      handleSpeakerChange: handleSpeakerChangeMock,
      narrationMode: false,
      speakerPlaceholder: 'Previous Speaker',
      toggleNarrationMode: toggleNarrationModeMock,
    },
    view: {
      basicRenderFields: computed(() => []),
      commandRenderFields: computed(() => []),
      effectEditorAtTop: computed(() => true),
      showAnimationEditorButton: computed(() => false),
      showEffectEditorButton: computed(() => true),
      specialContentMode: computed(() => undefined),
    },
    paramRenderer: {
      handleLabelPointerDown: vi.fn(),
      handleUpdateSelect: vi.fn(),
      handleUpdateValue: vi.fn(),
      sharedProps: computed(() => ({})),
    },
    ...overrides,
  }
}

function createStatementEntry(id: number, rawText: string): StatementEntry {
  return {
    id,
    rawText,
    parsed: undefined,
    parseError: false,
  }
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
  Collapsible: defineComponent({
    name: 'StubCollapsible',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  CollapsibleContent: defineComponent({
    name: 'StubCollapsibleContent',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  CollapsibleTrigger: defineComponent({
    name: 'StubCollapsibleTrigger',
    setup(_, { attrs, slots }) {
      return () => h('button', attrs, slots.default?.())
    },
  }),
  Input: defineComponent({
    name: 'StubInput',
    props: {
      modelValue: {
        type: String,
        required: false,
      },
      placeholder: {
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
  InputGroup: defineComponent({
    name: 'StubInputGroup',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  InputGroupAddon: defineComponent({
    name: 'StubInputGroupAddon',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  InputGroupButton: defineComponent({
    name: 'StubInputGroupButton',
    emits: ['click'],
    setup(_, { attrs, emit, slots }) {
      return () => h('button', {
        ...attrs,
        type: 'button',
        onClick: (event: MouseEvent) => emit('click', event),
      }, slots.default?.())
    },
  }),
  InputGroupInput: defineComponent({
    name: 'StubInputGroupInput',
    props: {
      disabled: Boolean,
      modelValue: {
        type: String,
        required: false,
      },
      placeholder: {
        type: String,
        required: false,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('input', {
        disabled: props.disabled,
        placeholder: props.placeholder,
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      })
    },
  }),
  ParamRenderer: defineComponent({
    name: 'StubParamRenderer',
    setup() {
      return () => h('div', 'ParamRenderer')
    },
  }),
  StatementCommandFieldsSection: defineComponent({
    name: 'StubStatementCommandFieldsSection',
    emits: ['openAnimationEditor', 'openEffectEditor'],
    setup(_, { emit }) {
      return () => h('div', [
        h('div', { 'data-testid': 'command-fields-section' }, 'CommandFieldsSection'),
        h('button', {
          type: 'button',
          onClick: () => emit('openEffectEditor'),
        }, 'Effect Editor'),
        h('button', {
          type: 'button',
          onClick: () => emit('openAnimationEditor'),
        }, 'Animation Editor'),
      ])
    },
  }),
  StatementSpecialContentEditor: defineComponent({
    name: 'StubStatementSpecialContentEditor',
    setup() {
      return () => h('div', 'SpecialContentEditor')
    },
  }),
}

describe('StatementEditorInline', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    handleCommentChangeMock.mockReset()
    handleInlineCommentChangeMock.mockReset()
    handleRawTextChangeMock.mockReset()
    handleSpeakerChangeMock.mockReset()
    toggleNarrationModeMock.mockReset()
    useStatementEditorMock.mockReset()
  })

  it('say 语句直接处理说话人与旁白切换', async () => {
    useStatementEditorMock.mockReturnValue(createEditorReturn({
      statementType: 'say',
    }))

    render(StatementEditorInline, {
      props: {
        entry: createStatementEntry(21, 'Alice:hello'),
      },
      global: {
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByPlaceholder('Previous Speaker').fill('Bob')
    await page.getByRole('button', { name: 'edit.visualEditor.narrationMode' }).click()

    expect(handleSpeakerChangeMock).toHaveBeenCalledWith('Bob')
    expect(toggleNarrationModeMock).toHaveBeenCalledTimes(1)
  })

  it('command 语句通过命令字段区组件转发动画和效果编辑事件', async () => {
    const onOpenAnimationEditor = vi.fn()
    const onOpenEffectEditor = vi.fn()

    useStatementEditorMock.mockReturnValue(createEditorReturn({
      statementType: 'command',
      view: {
        basicRenderFields: computed(() => []),
        commandRenderFields: computed(() => []),
        effectEditorAtTop: computed(() => false),
        showAnimationEditorButton: computed(() => true),
        showEffectEditorButton: computed(() => true),
        specialContentMode: computed(() => undefined),
      },
    }))

    render(StatementEditorInline, {
      props: {
        entry: createStatementEntry(22, 'changeBg:bg.jpg'),
        onOpenAnimationEditor,
        onOpenEffectEditor,
      },
      global: {
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('command-fields-section')).toBeVisible()
    await page.getByRole('button', { name: 'Effect Editor' }).click()
    await page.getByRole('button', { name: 'Animation Editor' }).click()

    expect(onOpenEffectEditor).toHaveBeenCalledTimes(1)
    expect(onOpenAnimationEditor).toHaveBeenCalledTimes(1)
  })
})
