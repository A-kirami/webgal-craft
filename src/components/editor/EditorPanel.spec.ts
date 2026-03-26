import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, reactive } from 'vue'

import { createBrowserLocalizedI18n } from '~/__tests__/browser'
import { renderInBrowser } from '~/__tests__/browser-render'

const {
  commandBridgeMock,
  effectEditorProviderMock,
  expandCommandPanelMock,
  sidebarPanelMock,
  statementAnimationDialogMock,
  useEditSettingsStoreMock,
  useEditorStoreMock,
  usePreferenceStoreMock,
  useStatementAnimationDialogMock,
  useTabsStoreMock,
} = vi.hoisted(() => ({
  commandBridgeMock: {
    activeBinding: {
      value: undefined as {
        insertCommand: ReturnType<typeof vi.fn>
        insertGroup: ReturnType<typeof vi.fn>
      } | undefined,
    },
  },
  effectEditorProviderMock: {
    apply: vi.fn(),
    canApply: false,
    canReset: false,
    close: vi.fn(async () => true),
    isOpen: false,
    requestPreview: vi.fn(),
    resetToInitialDraft: vi.fn(),
    session: undefined,
    updateDraft: vi.fn(),
  },
  expandCommandPanelMock: vi.fn(),
  sidebarPanelMock: {
    activeBinding: {
      value: undefined as {
        enableFocusStatement: boolean
        getEntry: () => unknown
        getIndex?: () => number | undefined
        getPreviousSpeaker?: () => string
        getUpdateTarget?: () => unknown
        handleRedo?: () => void
        handleUndo?: () => void
        onFocusStatement?: () => void
        onUpdate: ReturnType<typeof vi.fn>
      } | undefined,
    },
  },
  statementAnimationDialogMock: {
    draftFrames: [],
    handleApply: vi.fn(),
    isDefault: true,
    isDirty: false,
    isOpen: false,
    requestClose: vi.fn(),
    resetToDefault: vi.fn(),
    updateFrames: vi.fn(),
  },
  useEditSettingsStoreMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  useStatementAnimationDialogMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
}))

vi.mock('~/stores/editor', () => ({
  isAnimationVisualProjection: (state: { kind?: string, projection?: string }) =>
    state.kind === 'animation' && state.projection === 'visual',
  isEditableEditor: (state: { projection?: string }) => 'projection' in state,
  isSceneVisualProjection: (state: { kind?: string, projection?: string }) =>
    state.kind === 'scene' && state.projection === 'visual',
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/stores/edit-settings', () => ({
  useEditSettingsStore: useEditSettingsStoreMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

vi.mock('~/features/editor/effect-editor/useEffectEditorProvider', () => ({
  createEffectEditorProvider: vi.fn(() => effectEditorProviderMock),
  createEffectPreviewEmitter: vi.fn(() => ({
    emitPreview: vi.fn(),
    emitTransform: vi.fn(),
  })),
  useEffectEditorProvider: () => effectEditorProviderMock,
  useInjectedEffectEditorProvider: () => effectEditorProviderMock,
}))

vi.mock('~/features/editor/animation/useStatementAnimationDialog', () => ({
  useStatementAnimationDialog: useStatementAnimationDialogMock,
}))

vi.mock('~/features/editor/shared/useEditorPanelBindings', () => ({
  commandPanelBridgeKey: Symbol('commandPanelBridge'),
  sidebarPanelKey: Symbol('sidebarPanel'),
  useCommandPanelBridgeBinding: vi.fn(),
  useCommandPanelBridgeProvider: () => commandBridgeMock,
  useSidebarPanelBinding: vi.fn(),
  useSidebarPanelProvider: () => sidebarPanelMock,
}))

vi.mock('~/components/ui/resizable', () => {
  const ResizablePanel = defineComponent({
    name: 'MockResizablePanel',
    props: {
      collapsible: {
        type: Boolean,
        required: false,
      },
    },
    emits: ['collapse', 'expand'],
    setup(_, { emit, slots, expose }) {
      const state = reactive({
        isCollapsed: false,
      })

      function expand() {
        state.isCollapsed = false
        expandCommandPanelMock()
        emit('expand')
      }

      function collapse() {
        state.isCollapsed = true
        emit('collapse')
      }

      expose({
        collapse,
        expand,
        get isCollapsed() {
          return state.isCollapsed
        },
      })

      return () => h('div', {
        'data-resizable-collapsed': String(state.isCollapsed),
      }, slots.default?.({
        isCollapsed: state.isCollapsed,
      }))
    },
  })

  return {
    ResizablePanel,
  }
})

import EditorPanel from './EditorPanel.vue'

const globalStubs = {
  CommandPanel: defineComponent({
    name: 'StubCommandPanel',
    emits: ['insert-command', 'insert-group'],
    setup(_, { emit }) {
      return () => h('div', [
        h('button', {
          type: 'button',
          onClick: () => emit('insert-command', 'say'),
        }, 'insert-command'),
        h('button', {
          type: 'button',
          onClick: () => emit('insert-group', { id: 'group-1' }),
        }, 'insert-group'),
      ])
    },
  }),
  EditorSidebarLayout: defineComponent({
    name: 'StubEditorSidebarLayout',
    props: {
      show: {
        type: Boolean,
        required: false,
      },
    },
    setup(props, { slots }) {
      return () => h('div', {
        'data-show-sidebar': String(props.show),
      }, [
        h('div', { 'data-testid': 'main-slot' }, slots.default?.()),
        h('div', { 'data-testid': 'sidebar-slot' }, slots.sidebar?.()),
      ])
    },
  }),
  EditorTabs: defineComponent({
    name: 'StubEditorTabs',
    setup() {
      return () => h('div', 'Editor Tabs')
    },
  }),
  EditorToolbar: defineComponent({
    name: 'StubEditorToolbar',
    setup() {
      return () => h('div', 'Editor Toolbar')
    },
  }),
  EffectEditorPanel: defineComponent({
    name: 'StubEffectEditorPanel',
    setup() {
      return () => h('div', 'Effect Editor Panel')
    },
  }),
  FileEditor: defineComponent({
    name: 'StubFileEditor',
    setup() {
      return () => h('div', 'File Editor')
    },
  }),
  ResizableHandle: defineComponent({
    name: 'StubResizableHandle',
    setup() {
      return () => h('div', 'Resize Handle')
    },
  }),
  ResizablePanelGroup: defineComponent({
    name: 'StubResizablePanelGroup',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  Separator: defineComponent({
    name: 'StubSeparator',
    setup() {
      return () => h('div')
    },
  }),
  Sheet: defineComponent({
    name: 'StubSheet',
    props: {
      open: {
        type: Boolean,
        required: false,
      },
    },
    emits: ['update:open'],
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  SheetContent: defineComponent({
    name: 'StubSheetContent',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  SheetDescription: defineComponent({
    name: 'StubSheetDescription',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  SheetHeader: defineComponent({
    name: 'StubSheetHeader',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  SheetTitle: defineComponent({
    name: 'StubSheetTitle',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  StatementEditorPanel: defineComponent({
    name: 'StubStatementEditorPanel',
    setup() {
      return () => h('div', 'Statement Editor Panel')
    },
  }),
  StatementAnimationSubDialog: defineComponent({
    name: 'StubStatementAnimationSubDialog',
    setup() {
      return () => h('div', 'Statement Animation Dialog')
    },
  }),
}

function createEditorPanelI18n() {
  return createBrowserLocalizedI18n()
}

describe('EditorPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    commandBridgeMock.activeBinding.value = undefined
    sidebarPanelMock.activeBinding.value = undefined
    expandCommandPanelMock.mockReset()
    effectEditorProviderMock.apply.mockReset()
    effectEditorProviderMock.close.mockReset()
    effectEditorProviderMock.requestPreview.mockReset()
    effectEditorProviderMock.resetToInitialDraft.mockReset()
    effectEditorProviderMock.updateDraft.mockReset()
    effectEditorProviderMock.canApply = false
    effectEditorProviderMock.canReset = false
    effectEditorProviderMock.isOpen = false
    effectEditorProviderMock.session = undefined
    useStatementAnimationDialogMock.mockReset()
    useEditSettingsStoreMock.mockReset()
    useEditorStoreMock.mockReset()
    usePreferenceStoreMock.mockReset()
    useTabsStoreMock.mockReset()

    useEditorStoreMock.mockReturnValue(reactive({
      currentState: {
        kind: 'scene',
        path: '/game/start.txt',
        projection: 'visual',
      },
      isCurrentSceneFile: true,
    }))
    usePreferenceStoreMock.mockReturnValue(reactive({
      showSidebar: true,
    }))
    useEditSettingsStoreMock.mockReturnValue(reactive({
      effectEditorSide: 'right',
    }))
    useStatementAnimationDialogMock.mockReturnValue(statementAnimationDialogMock)
    useTabsStoreMock.mockReturnValue(reactive({
      shouldFocusEditor: false,
    }))
  })

  it('场景文件模式下会渲染命令面板并把插入事件转发给桥接处理器', async () => {
    const insertCommand = vi.fn()
    const insertGroup = vi.fn()

    commandBridgeMock.activeBinding.value = {
      insertCommand,
      insertGroup,
    }

    renderInBrowser(EditorPanel, {
      global: {
        plugins: [createEditorPanelI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'insert-command' }).click()
    await page.getByRole('button', { name: 'insert-group' }).click()

    expect(insertCommand).toHaveBeenCalledWith('say')
    expect(insertGroup).toHaveBeenCalledWith({ id: 'group-1' })
  })

  it('非场景文件模式下不会渲染命令面板', async () => {
    useEditorStoreMock.mockReturnValue(reactive({
      currentState: {
        kind: 'animation',
        path: '/game/effect.json',
        projection: 'visual',
      },
      isCurrentSceneFile: false,
    }))

    renderInBrowser(EditorPanel, {
      global: {
        plugins: [createEditorPanelI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('File Editor')).toBeVisible()
    await expect.element(page.getByText('Editor Toolbar')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'insert-command' })).not.toBeInTheDocument()
  })

  it('存在侧栏绑定但未选中语句时会显示文本模式空状态文案', async () => {
    useEditorStoreMock.mockReturnValue(reactive({
      currentState: {
        kind: 'scene',
        path: '/game/start.txt',
        projection: 'text',
      },
      isCurrentSceneFile: true,
    }))

    sidebarPanelMock.activeBinding.value = {
      enableFocusStatement: false,
      getEntry: () => undefined,
      onUpdate: vi.fn(),
    }

    renderInBrowser(EditorPanel, {
      global: {
        plugins: [createEditorPanelI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('移动光标到语句行以编辑')).toBeVisible()
    await expect.element(page.getByText('Statement Editor Panel')).not.toBeInTheDocument()
  })
})
