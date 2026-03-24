/* eslint-disable vue/one-component-per-file, vue/require-default-prop */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { computed, defineComponent, h, reactive } from 'vue'
import { createI18n } from 'vue-i18n'

const {
  handleCommentChangeMock,
  handleInlineCommentChangeMock,
  handleRawTextChangeMock,
  openAnimationEditorMock,
  handleSpeakerChangeMock,
  openEffectEditorMock,
  toggleNarrationModeMock,
  useEditSettingsStoreMock,
  useStatementAnimationEditorBridgeMock,
  useStatementEditorMock,
  useStatementEffectEditorBridgeMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  handleCommentChangeMock: vi.fn(),
  handleInlineCommentChangeMock: vi.fn(),
  handleRawTextChangeMock: vi.fn(),
  openAnimationEditorMock: vi.fn(),
  handleSpeakerChangeMock: vi.fn(),
  openEffectEditorMock: vi.fn(),
  toggleNarrationModeMock: vi.fn(),
  useEditSettingsStoreMock: vi.fn(),
  useStatementAnimationEditorBridgeMock: vi.fn(),
  useStatementEditorMock: vi.fn(),
  useStatementEffectEditorBridgeMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('~/composables/useStatementEditor', async importOriginal => ({
  ...(await importOriginal<typeof import('~/composables/useStatementEditor')>()),
  isStatementInteractiveTarget: () => false,
  useStatementEditor: useStatementEditorMock,
}))

vi.mock('~/composables/useStatementEffectEditorBridge', () => ({
  useStatementEffectEditorBridge: useStatementEffectEditorBridgeMock,
}))

vi.mock('~/composables/useStatementAnimationEditorBridge', () => ({
  useStatementAnimationEditorBridge: useStatementAnimationEditorBridgeMock,
}))

vi.mock('~/composables/useControlId', () => ({
  useControlId: () => ({
    buildControlId: (suffix: string) => `statement-panel-${suffix}`,
  }),
}))

vi.mock('~/stores/edit-settings', () => ({
  useEditSettingsStore: useEditSettingsStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

import StatementEditorPanel from './StatementEditorPanel.vue'

import type { StatementEntry } from '~/helper/webgal-script/sentence'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    missing: (_locale, key) => key,
  })
}

function createEditorReturn(overrides: Record<string, unknown> = {}) {
  return {
    parsed: computed(() => ({
      command: 'say',
      content: '',
      inlineComment: '',
    })),
    config: {
      icon: 'i-lucide-message-circle',
      locked: false,
    },
    theme: {
      bg: 'bg-blue-50',
      gradient: 'from-blue-500 to-blue-300',
      text: 'text-blue-500',
    },
    commandLabel: 'Dialogue',
    statementType: 'say',
    contentField: computed(() => undefined),
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
      handleCommitSlider: vi.fn(),
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
  FormItem: defineComponent({
    name: 'StubFormItem',
    props: {
      label: {
        type: String,
        required: false,
      },
    },
    setup(props, { slots }) {
      return () => h('div', [
        props.label ? h('div', props.label) : undefined,
        slots.default?.(),
      ])
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
      id: {
        type: String,
        required: false,
      },
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
        id: props.id,
        placeholder: props.placeholder,
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      })
    },
  }),
  Label: defineComponent({
    name: 'StubLabel',
    props: {
      for: {
        type: String,
        required: false,
      },
    },
    setup(props, { slots }) {
      return () => h('label', { for: props.for }, slots.default?.())
    },
  }),
  ParamRenderer: defineComponent({
    name: 'StubParamRenderer',
    setup() {
      return () => h('div', 'ParamRenderer')
    },
  }),
  ScrollArea: defineComponent({
    name: 'StubScrollArea',
    setup(_, { attrs, slots }) {
      return () => h('div', {
        ...attrs,
        'data-testid': 'scroll-area',
        'style': 'display:block; min-height:40px;',
      }, slots.default?.())
    },
  }),
  StatementAssetPreview: defineComponent({
    name: 'StubStatementAssetPreview',
    props: {
      src: {
        type: String,
        required: true,
      },
    },
    setup(props) {
      return () => h('img', {
        alt: 'asset-preview',
        src: props.src,
      })
    },
  }),
  StatementSpecialContentEditor: defineComponent({
    name: 'StubStatementSpecialContentEditor',
    setup() {
      return () => h('div', 'SpecialContentEditor')
    },
  }),
  Textarea: defineComponent({
    name: 'StubTextarea',
    props: {
      id: {
        type: String,
        required: false,
      },
      modelValue: {
        type: String,
        required: false,
      },
      placeholder: {
        type: String,
        required: false,
      },
    },
    emits: ['keydown.enter', 'update:modelValue'],
    setup(props, { emit }) {
      return () => h('textarea', {
        id: props.id,
        placeholder: props.placeholder,
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
      })
    },
  }),
}

describe('StatementEditorPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    handleCommentChangeMock.mockReset()
    handleInlineCommentChangeMock.mockReset()
    handleRawTextChangeMock.mockReset()
    handleSpeakerChangeMock.mockReset()
    openAnimationEditorMock.mockReset()
    openEffectEditorMock.mockReset()
    toggleNarrationModeMock.mockReset()
    useEditSettingsStoreMock.mockReset()
    useStatementAnimationEditorBridgeMock.mockReset()
    useStatementEditorMock.mockReset()
    useStatementEffectEditorBridgeMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    useEditSettingsStoreMock.mockReturnValue({
      showSidebarAssetPreview: false,
    })
    useStatementEffectEditorBridgeMock.mockReturnValue({
      openEffectEditor: openEffectEditorMock,
    })
    useStatementAnimationEditorBridgeMock.mockReturnValue({
      openAnimationEditor: openAnimationEditorMock,
    })
    useWorkspaceStoreMock.mockReturnValue(reactive({
      CWD: '/games/demo',
      currentGameServeUrl: 'http://127.0.0.1:8899',
    }))
  })

  it('点击标题会触发 focusStatement，点击效果编辑器会打开桥接弹窗', async () => {
    const onFocusStatement = vi.fn()
    useStatementEditorMock.mockReturnValue(createEditorReturn())

    render(StatementEditorPanel, {
      props: {
        enableFocusStatement: true,
        entry: createStatementEntry(7, 'say:hello'),
        onFocusStatement,
      },
      global: {
        plugins: [createTestI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByText('Dialogue').click()
    await page.getByRole('button', { name: 'edit.visualEditor.effectEditor' }).click()

    expect(onFocusStatement).toHaveBeenCalledTimes(1)
    expect(openEffectEditorMock).toHaveBeenCalledTimes(1)
  })

  it('不支持的命令编辑原始文本时会进行单行归一化', async () => {
    useStatementEditorMock.mockReturnValue(createEditorReturn({
      commandLabel: 'Unsupported',
      statementType: 'unsupported',
      view: {
        basicRenderFields: computed(() => []),
        commandRenderFields: computed(() => []),
        effectEditorAtTop: computed(() => false),
        showAnimationEditorButton: computed(() => false),
        showEffectEditorButton: computed(() => false),
        specialContentMode: computed(() => undefined),
      },
    }))

    render(StatementEditorPanel, {
      props: {
        entry: createStatementEntry(8, 'old raw text'),
      },
      global: {
        plugins: [createTestI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByRole('textbox').fill('line1\nline2')

    expect(handleRawTextChangeMock).toHaveBeenLastCalledWith('line1 line2')
  })

  it('双击空白区域后会显示行内注释输入框', async () => {
    useStatementEditorMock.mockReturnValue(createEditorReturn({
      statementType: 'command',
      view: {
        basicRenderFields: computed(() => []),
        commandRenderFields: computed(() => []),
        effectEditorAtTop: computed(() => false),
        showAnimationEditorButton: computed(() => false),
        showEffectEditorButton: computed(() => false),
        specialContentMode: computed(() => undefined),
      },
    }))

    render(StatementEditorPanel, {
      props: {
        entry: createStatementEntry(9, 'changeBg:bg.jpg'),
      },
      global: {
        plugins: [createTestI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByTestId('scroll-area').click({ clickCount: 2, force: true })

    await expect.element(page.getByPlaceholder('edit.visualEditor.placeholder.comment')).toBeVisible()
  })

  it('高级动画语句显示动画编辑器按钮并触发桥接打开', async () => {
    useStatementEditorMock.mockReturnValue(createEditorReturn({
      commandLabel: 'Advanced Animation',
      statementType: 'command',
      view: {
        basicRenderFields: computed(() => []),
        commandRenderFields: computed(() => []),
        effectEditorAtTop: computed(() => false),
        showAnimationEditorButton: computed(() => true),
        showEffectEditorButton: computed(() => false),
        specialContentMode: computed(() => undefined),
      },
    }))

    render(StatementEditorPanel, {
      props: {
        entry: createStatementEntry(10, 'setTempAnimation: [{"duration":0}];'),
      },
      global: {
        plugins: [createTestI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'edit.visualEditor.animation.title' }).click()

    expect(openAnimationEditorMock).toHaveBeenCalledTimes(1)
  })
})
