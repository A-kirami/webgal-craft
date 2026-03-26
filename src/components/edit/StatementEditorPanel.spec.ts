import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { computed, defineComponent, h, reactive } from 'vue'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserInputStub,
  createBrowserTextStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

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

function translate(key: string): string {
  switch (key) {
    case 'edit.visualEditor.narrationMode': {
      return '旁白'
    }
    case 'edit.visualEditor.placeholder.comment': {
      return '输入注释…'
    }
    default: {
      return key
    }
  }
}

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
import type { ComponentProps } from '~/types/index'

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
  Button: createBrowserClickStub('StubButton'),
  Collapsible: createBrowserContainerStub('StubCollapsible'),
  CollapsibleContent: createBrowserContainerStub('StubCollapsibleContent'),
  CollapsibleTrigger: createBrowserContainerStub('StubCollapsibleTrigger', 'button'),
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
  InputGroup: createBrowserContainerStub('StubInputGroup'),
  InputGroupAddon: createBrowserContainerStub('StubInputGroupAddon'),
  InputGroupButton: createBrowserClickStub('StubInputGroupButton'),
  InputGroupInput: createBrowserInputStub('StubInputGroupInput'),
  Label: createBrowserContainerStub('StubLabel', 'label'),
  ParamRenderer: createBrowserTextStub('StubParamRenderer', 'ParamRenderer'),
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
  StatementAssetPreview: createBrowserContainerStub('StubStatementAssetPreview', 'img'),
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
  StatementSpecialContentEditor: createBrowserTextStub('StubStatementSpecialContentEditor', 'SpecialContentEditor'),
  Textarea: createBrowserInputStub('StubTextarea', 'textarea'),
}

function renderStatementEditorPanel(props: ComponentProps<typeof StatementEditorPanel>) {
  renderInBrowser(StatementEditorPanel, {
    props,
    global: {
      mocks: {
        $t: translate,
      },
      stubs: globalStubs,
    },
  })
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
    useStatementEditorMock.mockReturnValue(createEditorReturn({
      statementType: 'command',
      view: {
        basicRenderFields: computed(() => []),
        commandRenderFields: computed(() => []),
        effectEditorAtTop: computed(() => false),
        showAnimationEditorButton: computed(() => false),
        showEffectEditorButton: computed(() => true),
        specialContentMode: computed(() => undefined),
      },
    }))

    renderStatementEditorPanel({
      enableFocusStatement: true,
      entry: createStatementEntry(7, 'say:hello'),
      onFocusStatement,
    })

    await page.getByText('Dialogue').click()
    await page.getByRole('button', { name: 'Effect Editor' }).click()

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

    renderStatementEditorPanel({
      entry: createStatementEntry(8, 'old raw text'),
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

    renderStatementEditorPanel({
      entry: createStatementEntry(9, 'changeBg:bg.jpg'),
    })

    await page.getByTestId('scroll-area').click({ clickCount: 2, force: true })

    await expect.element(page.getByPlaceholder('输入注释…')).toBeVisible()
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

    renderStatementEditorPanel({
      entry: createStatementEntry(10, 'setTempAnimation: [{"duration":0}];'),
    })

    await page.getByRole('button', { name: 'Animation Editor' }).click()

    expect(openAnimationEditorMock).toHaveBeenCalledTimes(1)
  })

  it('say 语句直接处理说话人与旁白切换', async () => {
    useStatementEditorMock.mockReturnValue(createEditorReturn({
      statementType: 'say',
    }))

    renderStatementEditorPanel({
      entry: createStatementEntry(11, 'Alice:hello'),
    })

    await page.getByPlaceholder('Previous Speaker').fill('Bob')
    await page.getByRole('button', { name: '旁白' }).click()

    expect(handleSpeakerChangeMock).toHaveBeenCalledWith('Bob')
    expect(toggleNarrationModeMock).toHaveBeenCalledTimes(1)
  })

  it('command 语句通过命令字段区组件转发效果与动画编辑事件', async () => {
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

    renderStatementEditorPanel({
      entry: createStatementEntry(12, 'changeBg:bg.jpg'),
    })

    await expect.element(page.getByTestId('command-fields-section')).toBeVisible()
    await page.getByRole('button', { name: 'Effect Editor' }).click()
    await page.getByRole('button', { name: 'Animation Editor' }).click()

    expect(openEffectEditorMock).toHaveBeenCalledTimes(1)
    expect(openAnimationEditorMock).toHaveBeenCalledTimes(1)
  })
})
