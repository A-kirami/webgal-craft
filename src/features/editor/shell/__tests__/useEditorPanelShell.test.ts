import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, reactive, shallowRef } from 'vue'

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
  isCollapsed: ReadonlyRefLike<boolean>
}

interface ReadonlyRefLike<T> {
  readonly value: T
}

const {
  commandPanelBridgeMock,
  effectEditorProviderMock,
  sidebarPanelMock,
  statementAnimationDialogMock,
  useShortcutMock,
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
  useShortcutMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
}))

vi.mock('~/features/editor/shortcut/useShortcut', () => ({
  useShortcut: useShortcutMock,
}))

vi.mock('~/features/editor/animation/useStatementAnimationDialog', () => ({
  useStatementAnimationDialog: () => statementAnimationDialogMock,
}))

vi.mock('~/features/editor/effect-editor/useEffectEditorProvider', () => ({
  useEffectEditorProvider: () => effectEditorProviderMock,
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
  const commandPanelRef = shallowRef<CommandPanelLike | undefined>({
    collapse() {
      commandPanelState.isCollapsed = true
    },
    expand() {
      commandPanelState.isCollapsed = false
    },
    isCollapsed: computed(() => commandPanelState.isCollapsed),
  })

  const scope = effectScope()
  const shell = scope.run(() => useEditorPanelShell({
    commandPanelRef,
  }))

  if (!shell) {
    throw new TypeError('预期返回 editor panel shell')
  }

  return {
    commandPanelRef,
    preferenceStore,
    scope,
    shell,
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
    useShortcutMock.mockReset()
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

  it('会注册 statement editor 的撤销和重做快捷键', () => {
    const { scope } = createFixture()

    expect(useShortcutMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      allowInInput: true,
      i18nKey: 'shortcut.statementEditor.undo',
      id: 'statementEditor.undo',
      keys: 'Mod+Z',
      when: { panelFocus: 'statementEditor' },
    }))
    expect(useShortcutMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      allowInInput: true,
      i18nKey: 'shortcut.statementEditor.redo',
      id: 'statementEditor.redo',
      keys: ['Mod+Shift+Z', 'Mod+Y'],
      when: { panelFocus: 'statementEditor' },
    }))

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
