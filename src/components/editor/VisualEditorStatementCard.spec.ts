import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { computed, defineComponent, h } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

// 浏览器测试环境 uno.css 按需生成，折叠预览的布局类不会被扫描到，断言几何前必须 safelist
// @unocss-safelist flex inline-flex items-center gap-1 gap-2 text-xs text-nowrap font-medium rounded rounded-none shrink-0 w-5 overflow-hidden p-1 py-0.5 px-1 px-1.5 self-stretch ring-1 ring-inset ring-foreground/10 bg-muted bg-muted-foreground/10 text-muted-foreground
import 'virtual:uno.css'

import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import { LATEST_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'

import VisualEditorStatementCard from './VisualEditorStatementCard.vue'

import type { StatementEntry } from '~/domain/script/sentence'

const {
  buildStatementPreviewParamsMock,
  openAnimationEditorMock,
  openEffectEditorMock,
  provideStatementMetaMock,
  useStatementAnimationEditorBridgeMock,
  useStatementEffectEditorBridgeMock,
} = vi.hoisted(() => ({
  buildStatementPreviewParamsMock: vi.fn((): { label: string, status?: string, value: string, color?: string }[] => []),
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
  buildStatementPreviewParams: buildStatementPreviewParamsMock,
}))

vi.mock('~/features/editor/statement-editor/useStatementEditor', () => ({
  createStatementIdTarget: (statementId: number) => ({
    kind: 'statement',
    statementId,
  }),
  isStatementInteractiveTarget: () => false,
  useStatementEditor: vi.fn(),
}))

vi.mock('~/features/editor/statement-editor/useStatementFieldDiagnostics', () => ({
  useStatementFieldDiagnostics: () => ({
    getFieldStatus: () => 'none',
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
      startLine: 0,
      endLine: 0,
      isLineBreakHolder: false,
    },
    parseError: false,
    syntaxCapabilities: LATEST_ENGINE_RUNTIME_CAPABILITIES,
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
    buildStatementPreviewParamsMock.mockReset()
    openEffectEditorMock.mockReset()
    provideStatementMetaMock.mockReset()
    useStatementAnimationEditorBridgeMock.mockReset()
    useStatementEffectEditorBridgeMock.mockReset()

    provideStatementMetaMock.mockReturnValue(createStatementMeta())
    buildStatementPreviewParamsMock.mockReturnValue([])
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

  it('内容 warning 时把折叠参数标记为黄色警告样式', async () => {
    buildStatementPreviewParamsMock.mockReturnValue([{
      label: '',
      status: 'warning',
      value: 'start',
    }])

    renderInBrowser(VisualEditorStatementCard, {
      props: {
        collapsed: true,
        entry: createStatementEntry(7, 'label:start;'),
        index: 0,
      },
      global: {
        stubs: globalStubs,
      },
    })

    const value = await page.getByText('start').element()
    expect(value.parentElement).toHaveClass('text-yellow-700', 'bg-yellow/10')
    expect(value.parentElement).not.toHaveClass('text-destructive')
  })

  it('折叠色块占满值块高度并贴住右边缘', async () => {
    buildStatementPreviewParamsMock.mockReturnValue([{
      color: '#69D9FF',
      label: '字体颜色',
      value: '#69D9FF',
    }])

    renderInBrowser(VisualEditorStatementCard, {
      props: {
        collapsed: true,
        entry: createStatementEntry(7, 'changeBg:bg.jpg'),
        index: 0,
      },
      global: {
        stubs: globalStubs,
      },
    })

    const label = await page.getByText('字体颜色').element()
    const badge = label.parentElement
    const swatch = badge?.querySelector('span[role="presentation"]')
    if (!badge || !swatch) {
      throw new TypeError('折叠预览没有渲染出颜色胶囊或色块')
    }

    const badgeBox = badge.getBoundingClientRect()
    const swatchBox = swatch.getBoundingClientRect()
    expect(swatchBox.height).toBeCloseTo(badgeBox.height, 1)
    expect(swatchBox.right).toBeCloseTo(badgeBox.right, 1)
    expect(swatchBox.width).toBeCloseTo(20, 1)

    // 轮廓画在色块内侧：外层胶囊的 overflow-hidden 会裁掉外描边
    expect(getComputedStyle(swatch).boxShadow).toContain('inset')
  })
})
