import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { computed, defineComponent, h, ref } from 'vue'

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

vi.mock('~/features/editor/statement-editor/useStatementEditor', () => ({
  createStatementIdTarget: (statementId: number) => ({ kind: 'id', statementId }),
  isStatementInteractiveTarget: () => false,
  useStatementEditor: useStatementEditorMock,
}))

import StatementEditorInline from './StatementEditorInline.vue'

import type { StatementEntry } from '~/domain/script/sentence'

const speakerAutocompleteOptions = ref([
  { label: 'Alice', value: 'Alice' },
  { label: 'Bob', value: 'Bob' },
])

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
        defaultChooseIndex: { value: undefined },
        handleAddChooseItem: vi.fn(),
        handleChooseDefaultChange: vi.fn(),
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
    params: {
      callSceneParameters: computed(() => undefined),
      handleCallSceneParametersChange: vi.fn(),
    },
    misc: {
      handleCommentChange: handleCommentChangeMock,
      handleInlineCommentChange: handleInlineCommentChangeMock,
      handleRawTextChange: handleRawTextChangeMock,
    },
    say: {
      effectiveSpeaker: '',
      handleSpeakerChange: handleSpeakerChangeMock,
      narrationMode: false,
      speakerAutocompleteOptions,
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
      sharedProps: computed(() => ({
        getFieldDiagnostics: () => [],
      })),
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
  Input: createBrowserInputStub('StubInput'),
  InputGroup: createBrowserContainerStub('StubInputGroup'),
  InputGroupAddon: createBrowserContainerStub('StubInputGroupAddon'),
  InputGroupButton: createBrowserClickStub('StubInputGroupButton'),
  ParamRenderer: createBrowserTextStub('StubParamRenderer', 'ParamRenderer'),
  StatementCommandFieldsSection: defineComponent({
    name: 'StubStatementCommandFieldsSection',
    emits: ['openAnimationEditor', 'openEffectEditor'],
    setup(_, { emit }) {
      return () => h('div', [
        h('div', {
          'data-testid': 'command-fields-section',
        }, 'CommandFieldsSection'),
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

  it('say 语句支持选择建议、自由输入与旁白切换', async () => {
    useStatementEditorMock.mockReturnValue(createEditorReturn({
      statementType: 'say',
    }))

    renderInBrowser(StatementEditorInline, {
      props: {
        entry: createStatementEntry(21, 'Alice:hello'),
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'edit.visualEditor.narrationMode' }).click()
    expect(toggleNarrationModeMock).toHaveBeenCalledTimes(1)

    const input = page.getByPlaceholder('Previous Speaker')
    await input.click()
    await page.getByRole('option', { name: 'Bob' }).click()
    expect(handleSpeakerChangeMock).toHaveBeenCalledWith('Bob')

    await input.fill('Carol')
    expect(handleSpeakerChangeMock).toHaveBeenCalledWith('Carol')
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

    renderInBrowser(StatementEditorInline, {
      props: {
        entry: createStatementEntry(22, 'changeBg:bg.jpg'),
        onOpenAnimationEditor,
        onOpenEffectEditor,
      },
      global: {
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
