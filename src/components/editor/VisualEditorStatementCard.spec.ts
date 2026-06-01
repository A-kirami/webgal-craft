import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { computed, defineComponent, h } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

import VisualEditorStatementCard from './VisualEditorStatementCard.vue'

import type { StatementEntry } from '~/domain/script/sentence'

const {
  openAnimationEditorMock,
  openEffectEditorMock,
  provideStatementMetaMock,
  useStatementAnimationEditorBridgeMock,
  useStatementEffectEditorBridgeMock,
} = vi.hoisted(() => ({
  openAnimationEditorMock: vi.fn(),
  openEffectEditorMock: vi.fn(),
  provideStatementMetaMock: vi.fn(),
  useStatementAnimationEditorBridgeMock: vi.fn(),
  useStatementEffectEditorBridgeMock: vi.fn(),
}))

vi.mock('~/features/editor/animation/useStatementAnimationEditorBridge', () => ({
  useStatementAnimationEditorBridge: useStatementAnimationEditorBridgeMock,
}))

vi.mock('~/features/editor/effect-editor/useStatementEffectEditorBridge', () => ({
  useStatementEffectEditorBridge: useStatementEffectEditorBridgeMock,
}))

vi.mock('~/features/editor/statement-editor/preview', () => ({
  buildStatementPreviewParams: vi.fn(() => []),
}))

vi.mock('~/features/editor/statement-editor/useStatementEditor', () => ({
  createStatementIdTarget: (statementId: number) => ({
    kind: 'statement',
    statementId,
  }),
  isStatementInteractiveTarget: () => false,
  useStatementEditor: vi.fn(),
}))

vi.mock('~/features/editor/statement-editor/useStatementFileMissing', () => ({
  useStatementFileMissing: () => ({
    fileMissingKeys: computed(() => new Set<string>()),
  }),
}))

vi.mock('~/features/editor/statement-editor/useStatementMeta', () => ({
  provideStatementMeta: provideStatementMetaMock,
}))

function createStatementEntry(id: number, rawText: string): StatementEntry {
  return {
    id,
    rawText,
    parsed: {
      command: commandType.changeBg,
      commandRaw: 'changeBg',
      content: 'bg.jpg',
      args: [],
      sentenceAssets: [],
      subScene: [],
      inlineComment: '',
    },
    parseError: false,
  }
}

function createStatementMeta() {
  return {
    parsed: computed(() => createStatementEntry(7, 'changeBg:bg.jpg').parsed),
    config: computed(() => ({
      icon: 'i-lucide-image',
      locked: false,
    })),
    contentField: computed(() => undefined),
    argFields: computed(() => []),
    theme: computed(() => ({
      bg: 'bg-muted',
      gradient: 'from-muted to-muted',
      text: 'text-muted-foreground',
    })),
    statementType: computed(() => 'command'),
    commandLabel: computed(() => 'changeBg'),
  }
}

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  Collapsible: createBrowserContainerStub('StubCollapsible'),
  CollapsibleContent: createBrowserContainerStub('StubCollapsibleContent'),
  Separator: createBrowserContainerStub('StubSeparator'),
  StatementEditorInline: defineComponent({
    name: 'StubStatementEditorInline',
    emits: ['openAnimationEditor', 'openEffectEditor', 'update'],
    setup(_, { emit }) {
      return () => h('button', {
        type: 'button',
        onClick: () => emit('openEffectEditor'),
      }, 'Effect Editor')
    },
  }),
}

describe('VisualEditorStatementCard', () => {
  beforeEach(() => {
    openAnimationEditorMock.mockReset()
    openEffectEditorMock.mockReset()
    provideStatementMetaMock.mockReset()
    useStatementAnimationEditorBridgeMock.mockReset()
    useStatementEffectEditorBridgeMock.mockReset()

    provideStatementMetaMock.mockReturnValue(createStatementMeta())
    useStatementAnimationEditorBridgeMock.mockReturnValue({
      openAnimationEditor: openAnimationEditorMock,
    })
    useStatementEffectEditorBridgeMock.mockReturnValue({
      openEffectEditor: openEffectEditorMock,
    })
  })

  it('打开效果编辑器前会先选中当前语句', async () => {
    const events: string[] = []
    const entry = createStatementEntry(7, 'changeBg:bg.jpg')
    const onSelect = vi.fn(() => {
      events.push('select')
    })
    openEffectEditorMock.mockImplementation(() => {
      events.push('openEffectEditor')
    })

    renderInBrowser(VisualEditorStatementCard, {
      props: {
        collapsed: false,
        entry,
        index: 0,
        selected: false,
        onSelect,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'Effect Editor' }).click()

    expect(events.slice(0, 2)).toEqual(['select', 'openEffectEditor'])
    expect(onSelect).toHaveBeenCalledWith(7)
  })
})
