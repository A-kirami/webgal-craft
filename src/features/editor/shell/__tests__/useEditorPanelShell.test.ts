import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, reactive, ref } from 'vue'

import { useEditorPanelShell } from '../useEditorPanelShell'

interface BindingMock {
  enableFocusStatement: boolean
  getEntry: () => unknown
  getIndex?: () => number | undefined
  getPreviousSpeaker?: () => string
  getUpdateTarget?: () => unknown
  handleRedo?: () => void
  handleUndo?: () => void
  onFocusStatement?: () => void
  onUpdate: ReturnType<typeof vi.fn>
}

interface CommandPanelLike {
  collapse: () => void
  expand: () => void
  isCollapsed: boolean
}

const {
  commandPanelBridgeMock,
  effectEditorProviderMock,
  resolveHistoryShortcutActionMock,
  sidebarPanelMock,
  statementAnimationDialogMock,
  useEditorStoreMock,
  usePreferenceStoreMock,
  useTabsStoreMock,
} = vi.hoisted(() => ({
  commandPanelBridgeMock: {
    activeBinding: { value: undefined as {
      insertCommand: ReturnType<typeof vi.fn>
      insertGroup: ReturnType<typeof vi.fn>
    } | undefined },
  },
  effectEditorProviderMock: {
    apply: vi.fn(async () => true),
    canApply: false,
    canReset: false,
    close: vi.fn(async () => true),
    isOpen: false,
    requestPreview: vi.fn(),
    resetToInitialDraft: vi.fn(),
    session: undefined,
    updateDraft: vi.fn(),
  },
  resolveHistoryShortcutActionMock: vi.fn(),
  sidebarPanelMock: {
    activeBinding: { value: undefined as BindingMock | undefined },
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
  useTabsStoreMock: vi.fn(),
}))

vi.mock('~/features/editor/animation/useStatementAnimationDialog', () => ({
  useStatementAnimationDialog: () => statementAnimationDialogMock,
}))

vi.mock('~/features/editor/effect-editor/useEffectEditorProvider', () => ({
  useEffectEditorProvider: () => effectEditorProviderMock,
}))

vi.mock('~/features/editor/shared/history-shortcut', () => ({
  resolveHistoryShortcutAction: resolveHistoryShortcutActionMock,
}))

vi.mock('~/features/editor/shared/useEditorPanelBindings', () => ({
  useCommandPanelBridgeProvider: () => commandPanelBridgeMock,
  useSidebarPanelProvider: () => sidebarPanelMock,
}))

vi.mock('~/stores/editor', () => ({
  isEditableEditor: (state: { projection?: string }) => 'projection' in state,
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

function createFixture(options: {
  currentProjection?: string
  isCurrentSceneFile?: boolean
} = {}) {
  const tabsStore = {
    shouldFocusEditor: false,
  }
  const editorStore = {
    currentState: {
      projection: options.currentProjection ?? 'visual',
    },
    isCurrentSceneFile: options.isCurrentSceneFile ?? true,
  }
  const preferenceStore = {
    showSidebar: true,
  }

  useTabsStoreMock.mockReturnValue(tabsStore)
  useEditorStoreMock.mockReturnValue(editorStore)
  usePreferenceStoreMock.mockReturnValue(preferenceStore)

  const commandPanelState = reactive({
    isCollapsed: false,
  })
  const commandPanelRef = ref<CommandPanelLike | undefined>({
    collapse() {
      commandPanelState.isCollapsed = true
      this.isCollapsed = true
    },
    expand() {
      commandPanelState.isCollapsed = false
      this.isCollapsed = false
    },
    get isCollapsed() {
      return commandPanelState.isCollapsed
    },
    set isCollapsed(value: boolean) {
      commandPanelState.isCollapsed = value
    },
  })
  const sidebarHistoryScopeRef = ref<HTMLDivElement>()

  const scope = effectScope()
  const shell = scope.run(() => useEditorPanelShell({
    commandPanelRef,
    sidebarHistoryScopeRef,
  }))

  if (!shell) {
    throw new TypeError('预期返回 editor panel shell')
  }

  return {
    commandPanelRef,
    preferenceStore,
    scope,
    shell,
    sidebarHistoryScopeRef,
    tabsStore,
  }
}

describe('useEditorPanelShell 行为', () => {
  beforeEach(() => {
    commandPanelBridgeMock.activeBinding.value = undefined
    sidebarPanelMock.activeBinding.value = undefined
    effectEditorProviderMock.apply.mockClear()
    effectEditorProviderMock.canApply = false
    effectEditorProviderMock.canReset = false
    effectEditorProviderMock.close.mockClear()
    effectEditorProviderMock.close.mockResolvedValue(true)
    effectEditorProviderMock.updateDraft.mockClear()
    effectEditorProviderMock.resetToInitialDraft.mockClear()
    resolveHistoryShortcutActionMock.mockReset()
    useEditorStoreMock.mockReset()
    usePreferenceStoreMock.mockReset()
    useTabsStoreMock.mockReset()
  })

  it('侧栏显隐会同时受用户偏好和当前文件类型约束', () => {
    const { preferenceStore, scope, shell } = createFixture({
      isCurrentSceneFile: false,
    })

    expect(shell.effectiveShowSidebar.value).toBe(false)

    shell.effectiveShowSidebar.value = false

    expect(preferenceStore.showSidebar).toBe(false)
    scope.stop()
  })

  it('命令面板折叠态会在 toggle 时正确切换', () => {
    const { scope, shell } = createFixture()

    expect(shell.isCommandPanelCollapsed.value).toBe(false)

    shell.toggleCommandPanel()
    expect(shell.isCommandPanelCollapsed.value).toBe(true)

    shell.toggleCommandPanel()
    expect(shell.isCommandPanelCollapsed.value).toBe(false)

    scope.stop()
  })

  it('仅在焦点位于侧栏范围内时转发历史快捷键', () => {
    const handleUndo = vi.fn()
    const handleRedo = vi.fn()
    sidebarPanelMock.activeBinding.value = {
      enableFocusStatement: false,
      getEntry: () => ({ id: 1 }),
      handleRedo,
      handleUndo,
      onUpdate: vi.fn(),
    }
    resolveHistoryShortcutActionMock.mockImplementation((event: KeyboardEvent) => {
      if (event.key === 'z') {
        return 'undo'
      }
      if (event.key === 'y') {
        return 'redo'
      }
    })

    const { scope, shell, sidebarHistoryScopeRef } = createFixture()
    const insideTarget = { id: 'inside' }
    const outsideTarget = { id: 'outside' }
    const insideNode = insideTarget as unknown as Node
    sidebarHistoryScopeRef.value = {
      contains(target: Node | null) {
        return target === insideNode
      },
    } as unknown as HTMLDivElement

    shell.handleSidebarHistoryShortcutKeydown({
      key: 'z',
      preventDefault: vi.fn(),
      target: insideNode,
    } as unknown as KeyboardEvent)
    shell.handleSidebarHistoryShortcutKeydown({
      key: 'y',
      preventDefault: vi.fn(),
      target: insideNode,
    } as unknown as KeyboardEvent)
    shell.handleSidebarHistoryShortcutKeydown({
      key: 'z',
      preventDefault: vi.fn(),
      target: outsideTarget,
    } as unknown as KeyboardEvent)

    expect(handleUndo).toHaveBeenCalledTimes(1)
    expect(handleRedo).toHaveBeenCalledTimes(1)

    scope.stop()
  })

  it('文本模式关闭 effect editor 后会请求重新聚焦文本编辑器', async () => {
    const { scope, shell, tabsStore } = createFixture({
      currentProjection: 'text',
    })

    await shell.closeEffectEditor()

    expect(effectEditorProviderMock.close).toHaveBeenCalledTimes(1)
    expect(tabsStore.shouldFocusEditor).toBe(true)

    scope.stop()
  })
})
