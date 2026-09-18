import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { computed, defineComponent, h, nextTick, reactive, ref, shallowRef } from 'vue'

import { createBrowserLocalizedI18n } from '~/__tests__/browser'
import { renderInBrowser } from '~/__tests__/browser-render'
import { useShortcutContextRegistry } from '~/features/editor/shortcut/shortcut-context-registry'
import { shortcutDispatcherRegistryKey } from '~/features/editor/shortcut/useShortcutDispatcher'
import { TRANSFORM_OVERLAY_BRIDGE_KEY } from '~/features/editor/transform-overlay/context'

import EditorPanel from './EditorPanel.vue'

import type { Transform } from '~/domain/stage/types'
import type { EffectEditorDraft } from '~/features/editor/effect-editor/useEffectEditorProvider'
import type { ShortcutDefinition } from '~/features/editor/shortcut/types'
import type { TransformBaselineSource } from '~/features/editor/transform-resolution/model'

interface EffectEditorSessionMock {
  baselineSource: TransformBaselineSource
  baselineTransform?: Transform
  draft: EffectEditorDraft
}

const {
  commandBridgeMock,
  effectEditorProviderMock,
  expandCommandPanelMock,
  sidebarPanelMock,
  statementAnimationDialogMock,
  useEditorStoreMock,
  useEditorDiagnosticsStoreMock,
  usePreferenceStoreMock,
  useStatementAnimationDialogMock,
  useTabsStoreMock,
  useEditorDiagnosticsMock,
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
    canClear: false,
    clearDraft: vi.fn(),
    close: vi.fn(async () => true),
    isOpen: false,
    requestPreview: vi.fn(),
    session: undefined as EffectEditorSessionMock | undefined,
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
  useEditorDiagnosticsStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  useStatementAnimationDialogMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useEditorDiagnosticsMock: vi.fn(),
}))

vi.mock('~/features/editor/diagnostics/useEditorDiagnostics', () => ({
  useEditorDiagnostics: useEditorDiagnosticsMock,
}))

vi.mock('~/stores/editor', () => ({
  isAnimationVisualProjection: (state: { kind?: string, projection?: string }) =>
    state.kind === 'animation' && state.projection === 'visual',
  isEditableEditor: (state: { projection?: string }) => 'projection' in state,
  isSceneVisualProjection: (state: { kind?: string, projection?: string }) =>
    state.kind === 'scene' && state.projection === 'visual',
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/editor-diagnostics', () => ({
  useEditorDiagnosticsStore: useEditorDiagnosticsStoreMock,
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
    emits: ['clear'],
    setup(_, { emit }) {
      return () => h('div', [
        h('div', 'Effect Editor Panel'),
        h('button', {
          type: 'button',
          onClick: () => emit('clear'),
        }, 'clear-effect'),
      ])
    },
  }),
  FileEditor: defineComponent({
    name: 'StubFileEditor',
    setup() {
      return () => h('div', [
        h('div', 'File Editor'),
        h('div', {
          'data-drawer-interactive-region': '',
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
    setup(_, { attrs, expose, slots }) {
      const elementRef = ref<HTMLElement>()

      // 与真实 SheetContent 一样暴露 contentElement；桩保持挂载，用来在没有 CSS 动画的测试环境里
      // 覆盖「退场动画期间内容仍在 DOM」这一状态
      expose({ contentElement: computed(() => elementRef.value) })

      return () => h('div', { ...attrs, ref: elementRef }, slots.default?.())
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
      return () => h('div', {
        'data-testid': 'statement-editor-panel',
      }, 'Statement Editor Panel')
    },
  }),
  StatementAnimationEditorPanel: defineComponent({
    name: 'StubStatementAnimationEditorPanel',
    setup() {
      return () => h('button', {
        type: 'button',
      }, 'Statement Animation Editor Panel')
    },
  }),
}

function createEditorPanelI18n() {
  return createBrowserLocalizedI18n()
}

function renderEditorPanel(options: {
  provide?: Record<symbol, unknown>
  stubs?: Record<string, unknown>
} = {}) {
  renderInBrowser(EditorPanel, {
    global: {
      plugins: [createEditorPanelI18n()],
      provide: options.provide,
      stubs: {
        ...globalStubs,
        ...options.stubs,
      },
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

async function refreshDrawerDismissLayers(): Promise<void> {
  globalThis.dispatchEvent(new Event('resize'))
  await nextTick()
}

function getDrawerDismissLayers(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-testid="editor-drawer-dismiss-layer"]')]
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
    effectEditorProviderMock.clearDraft.mockReset()
    effectEditorProviderMock.close.mockReset()
    effectEditorProviderMock.requestPreview.mockReset()
    effectEditorProviderMock.updateDraft.mockReset()
    effectEditorProviderMock.canApply = false
    effectEditorProviderMock.canClear = false
    effectEditorProviderMock.isOpen = false
    effectEditorProviderMock.session = undefined
    statementAnimationDialogMock.isOpen = false
    useStatementAnimationDialogMock.mockReset()
    useEditorStoreMock.mockReset()
    useEditorDiagnosticsStoreMock.mockReset()
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
    useEditorDiagnosticsStoreMock.mockReturnValue({
      readStatementDiagnostics: vi.fn(() => []),
    })
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

    await expect.element(page.getByText('将光标移到语句行即可编辑')).toBeVisible()
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

    await expect.element(page.getByText('同时选中了多个编辑目标，语句编辑已暂停')).toBeVisible()
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

  it('点击效果编辑器清除操作会直接委托给 provider', async () => {
    effectEditorProviderMock.isOpen = true
    effectEditorProviderMock.session = {
      baselineSource: 'unknown',
      draft: {
        duration: '300',
        ease: 'easeInOut',
        transform: { blur: 8 },
      },
    }

    renderEditorPanel()
    await page.getByRole('button', { name: 'clear-effect' }).click()

    expect(effectEditorProviderMock.clearDraft).toHaveBeenCalledOnce()
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

    await refreshDrawerDismissLayers()

    expect(getDrawerDismissLayers()).toHaveLength(1)
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

    await refreshDrawerDismissLayers()

    expect(getDrawerDismissLayers().length).toBeGreaterThan(1)
  })

  it('效果编辑器初始打开且变换框可用时无需额外交互即可保留预览交互区域', async () => {
    effectEditorProviderMock.isOpen = true

    renderEditorPanel({
      provide: {
        [TRANSFORM_OVERLAY_BRIDGE_KEY as symbol]: createTransformOverlayBridge(true),
      },
    })

    await vi.waitFor(() => {
      expect(getDrawerDismissLayers().length).toBeGreaterThan(1)
    })
  })

  it('预览工作区尺寸变化时遮罩分段会跟随', async () => {
    effectEditorProviderMock.isOpen = true

    renderEditorPanel({
      provide: {
        [TRANSFORM_OVERLAY_BRIDGE_KEY as symbol]: createTransformOverlayBridge(true),
      },
    })
    await vi.waitFor(() => {
      expect(getDrawerDismissLayers().length).toBeGreaterThan(1)
    })

    const region = document.querySelector<HTMLElement>('[data-testid="preview-interactive-region"]')!
    const widthsBefore = getDrawerDismissLayers().map(element => element.style.width)
    region.style.width = '400px'

    // 拖动编辑器分栏只改变预览区尺寸、不触发窗口 resize，遮罩必须靠元素尺寸观察跟上
    await vi.waitFor(() => {
      expect(getDrawerDismissLayers().map(element => element.style.width)).not.toEqual(widthsBefore)
    })
  })

  it('动画编辑器抽屉打开时预览区仍属于抽屉外区域', async () => {
    statementAnimationDialogMock.isOpen = true

    renderEditorPanel()
    await refreshDrawerDismissLayers()

    // 帧级预览浮层尚未交付，预览区不是动画编辑器的编辑面，遮罩应当整层接管
    const region = document.querySelector<HTMLElement>('[data-drawer-interactive-region]')
    expect(region?.getBoundingClientRect().width).toBeGreaterThan(0)
    expect(getDrawerDismissLayers()).toHaveLength(1)
  })

  it('点击抽屉外区域会请求关闭动画编辑器', async () => {
    statementAnimationDialogMock.isOpen = true

    renderEditorPanel()
    await refreshDrawerDismissLayers()

    const [dismissLayer] = getDrawerDismissLayers()
    expect(dismissLayer).toBeDefined()
    // 浏览器测试不加载 UnoCSS，遮罩分段没有 position: fixed，命中检测不可用，直接派发点击
    dismissLayer!.click()

    expect(statementAnimationDialogMock.requestClose).toHaveBeenCalledOnce()
  })

  it('动画编辑器抽屉内容获得焦点时仍保持动画编辑器快捷键上下文', async () => {
    statementAnimationDialogMock.isOpen = true

    renderEditorPanel()

    await page.getByRole('button', { name: 'Statement Animation Editor Panel' }).click()

    await vi.waitFor(() => {
      expect(useShortcutContextRegistry().resolveContext().panelFocus).toBe('animationEditor')
    })
  })

  it('抽屉关闭后不再占用快捷键上下文', async () => {
    statementAnimationDialogMock.isOpen = false

    renderEditorPanel()

    await page.getByRole('button', { name: 'Statement Animation Editor Panel' }).click()

    // 关闭动画期间内容可能仍在 DOM 内且持有焦点，上下文必须由 open 而不是 target 决定去留
    expect(useShortcutContextRegistry().resolveContext().panelFocus).not.toBe('animationEditor')
  })

  it('动画编辑器抽屉聚焦到内置关闭按钮时仍保持动画编辑器快捷键上下文', async () => {
    statementAnimationDialogMock.isOpen = true

    // 关闭按钮由 SheetContent 在插槽之外渲染，只有按整个抽屉表面注册上下文才覆盖得到
    renderEditorPanel({ stubs: { Sheet: false, SheetContent: false } })

    await page.getByRole('button', { name: 'Close' }).click()

    await vi.waitFor(() => {
      expect(useShortcutContextRegistry().resolveContext().panelFocus).toBe('animationEditor')
    })
  })

  it('动画编辑器抽屉打开时不会把界面标记为全局模态', async () => {
    statementAnimationDialogMock.isOpen = true

    renderEditorPanel()

    expect(useShortcutContextRegistry().resolveContext().isModalOpen).toBeFalsy()
  })

  it('动画编辑器抽屉聚焦时会注册应用与关闭快捷键', async () => {
    const bindings = renderEditorPanelWithShortcutRegistry()
    await vi.waitFor(() => {
      expect(bindings.size).toBeGreaterThan(0)
    })

    const applyBinding = [...bindings.values()].find(item => item.id === 'animation.apply')
    const closeBinding = [...bindings.values()].find(item => item.id === 'animation.close')
    expect(applyBinding?.when).toEqual({ panelFocus: 'animationEditor' })
    expect(closeBinding?.when).toEqual({ panelFocus: 'animationEditor' })

    await applyBinding!.execute(undefined)
    await closeBinding!.execute(undefined)

    expect(statementAnimationDialogMock.handleApply).toHaveBeenCalledOnce()
    expect(statementAnimationDialogMock.requestClose).toHaveBeenCalledOnce()
  })
})
