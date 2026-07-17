import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, nextTick, reactive, shallowRef } from 'vue'

import { createBrowserLocalizedI18n } from '~/__tests__/browser'
import { renderInBrowser } from '~/__tests__/browser-render'
import { shortcutDispatcherRegistryKey } from '~/features/editor/shortcut/useShortcutDispatcher'
import { TRANSFORM_OVERLAY_BRIDGE_KEY } from '~/features/editor/transform-overlay/context'

import EditorPanel from './EditorPanel.vue'

import type { ShortcutDefinition } from '~/features/editor/shortcut/types'

const {
  commandBridgeMock,
  effectEditorProviderMock,
  expandCommandPanelMock,
  sidebarPanelMock,
  statementAnimationDialogMock,
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
        getEmptyState?: () => 'multiple-edit-targets' | undefined
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
      return () => h('div', [
        h('div', 'File Editor'),
        h('div', {
          'data-effect-editor-interactive-region': '',
          'data-testid': 'preview-interactive-region',
          'style': {
            height: '120px',
            left: '160px',
            position: 'fixed',
            top: '120px',
            width: '240px',
          },
        }),
      ])
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
    setup(_, { attrs, slots }) {
      return () => h('div', {
        'data-testid': 'effect-editor-sheet',
        ...attrs,
      }, slots.default?.())
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

function renderEditorPanel(options: {
  provide?: Record<symbol, unknown>
} = {}) {
  renderInBrowser(EditorPanel, {
    global: {
      plugins: [createEditorPanelI18n()],
      provide: options.provide,
      stubs: globalStubs,
    },
  })
}

function renderEditorPanelWithShortcutRegistry() {
  const bindings = new Map<symbol, ShortcutDefinition<unknown>>()
  renderEditorPanel({
    provide: {
      [shortcutDispatcherRegistryKey as symbol]: {
        registerBinding: () => Symbol('shortcut-binding'),
        unregisterBinding: (token: symbol) => bindings.delete(token),
        updateBinding: (token: symbol, binding: ShortcutDefinition<unknown>) => {
          bindings.set(token, binding)
        },
      },
    },
  })

  return bindings
}

function createTransformOverlayBridge(enabled: boolean) {
  return {
    enabled: shallowRef(enabled),
    formDisplayTransform: shallowRef(undefined),
    handlePanelTransformUpdate: vi.fn(),
  }
}

async function updateEffectEditorInteractiveRegion(): Promise<void> {
  globalThis.dispatchEvent(new Event('resize'))
  await nextTick()
}

function getEffectEditorDismissLayers(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-testid="effect-editor-dismiss-layer"]')]
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
    useEditorStoreMock.mockReset()
    usePreferenceStoreMock.mockReset()
    useTabsStoreMock.mockReset()

    useEditorStoreMock.mockReturnValue(reactive({
      currentState: {
        kind: 'scene',
        path: '/game/start.txt',
        projection: 'visual',
        statements: [],
      },
      isCurrentSceneFile: true,
    }))
    usePreferenceStoreMock.mockReturnValue(reactive({
      showSidebar: true,
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

    renderEditorPanel()

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

    renderEditorPanel()

    await expect.element(page.getByText('File Editor')).toBeVisible()
    await expect.element(page.getByText('Editor Toolbar')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'insert-command' })).not.toBeInTheDocument()
  })

  it('空标签页不会挂载辅助侧栏布局', async () => {
    useEditorStoreMock.mockReturnValue(reactive({
      currentState: undefined,
      isCurrentSceneFile: false,
    }))
    usePreferenceStoreMock.mockReturnValue(reactive({
      showSidebar: true,
    }))

    renderEditorPanel()

    await expect.element(page.getByText('File Editor')).toBeVisible()
    await expect.element(page.getByTestId('sidebar-slot')).not.toBeInTheDocument()
  })

  it('存在侧栏绑定但未选中语句时会显示文本模式空状态文案', async () => {
    useEditorStoreMock.mockReturnValue(reactive({
      currentState: {
        kind: 'scene',
        path: '/game/start.txt',
        projection: 'text',
        textContent: '',
      },
      isCurrentSceneFile: true,
    }))

    sidebarPanelMock.activeBinding.value = {
      enableFocusStatement: false,
      getEntry: () => undefined,
      onUpdate: vi.fn(),
    }

    renderEditorPanel()

    await expect.element(page.getByText('移动光标到语句行以编辑')).toBeVisible()
    await expect.element(page.getByText('Statement Editor Panel')).not.toBeInTheDocument()
  })

  it('存在多个编辑目标时会显示暂停单语句编辑的占位文案', async () => {
    useEditorStoreMock.mockReturnValue(reactive({
      currentState: {
        kind: 'scene',
        path: '/game/start.txt',
        projection: 'text',
        textContent: '',
      },
      isCurrentSceneFile: true,
    }))

    sidebarPanelMock.activeBinding.value = {
      enableFocusStatement: false,
      getEmptyState: () => 'multiple-edit-targets',
      getEntry: () => undefined,
      onUpdate: vi.fn(),
    }

    renderEditorPanel()

    await expect.element(page.getByText('当前存在多个编辑目标，语句编辑已暂停')).toBeVisible()
    await expect.element(page.getByText('Statement Editor Panel')).not.toBeInTheDocument()
  })

  it('变换浮层聚焦时按下回车或组合回车会应用效果编辑器变更', async () => {
    effectEditorProviderMock.canApply = true
    effectEditorProviderMock.apply.mockResolvedValue(true)

    const bindings = renderEditorPanelWithShortcutRegistry()
    await vi.waitFor(() => {
      expect(bindings.size).toBeGreaterThan(0)
    })

    const binding = [...bindings.values()].find(item =>
      item.when?.panelFocus === 'transformOverlay'
      && item.keys.includes('Enter')
      && item.keys.includes('Mod+Enter'),
    )
    expect(binding).toBeDefined()

    await binding!.execute(undefined)

    expect(effectEditorProviderMock.apply).toHaveBeenCalledOnce()
  })

  it('效果编辑器打开但变换框不可用时不会放行预览交互区域', async () => {
    effectEditorProviderMock.isOpen = true

    renderEditorPanel({
      provide: {
        [TRANSFORM_OVERLAY_BRIDGE_KEY as symbol]: createTransformOverlayBridge(false),
      },
    })

    const region = document.querySelector<HTMLElement>('[data-testid="preview-interactive-region"]')
    expect(region?.getBoundingClientRect().width).toBeGreaterThan(0)

    await updateEffectEditorInteractiveRegion()

    expect(getEffectEditorDismissLayers()).toHaveLength(1)
  })

  it('效果编辑器打开且变换框可用时会保留预览交互区域', async () => {
    effectEditorProviderMock.isOpen = true

    renderEditorPanel({
      provide: {
        [TRANSFORM_OVERLAY_BRIDGE_KEY as symbol]: createTransformOverlayBridge(true),
      },
    })

    const region = document.querySelector<HTMLElement>('[data-testid="preview-interactive-region"]')
    expect(region?.getBoundingClientRect().width).toBeGreaterThan(0)

    await updateEffectEditorInteractiveRegion()

    expect(getEffectEditorDismissLayers().length).toBeGreaterThan(1)
  })

  it('效果编辑器初始打开且变换框可用时会立即保留预览交互区域', async () => {
    effectEditorProviderMock.isOpen = true

    renderEditorPanel({
      provide: {
        [TRANSFORM_OVERLAY_BRIDGE_KEY as symbol]: createTransformOverlayBridge(true),
      },
    })

    await nextTick()

    expect(getEffectEditorDismissLayers().length).toBeGreaterThan(1)
  })
})
