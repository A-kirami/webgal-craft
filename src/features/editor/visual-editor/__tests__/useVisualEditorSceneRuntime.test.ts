import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, reactive } from 'vue'

import { computeLineNumberFromStatementId } from '~/domain/document/scene-selection'

import { useVisualEditorSceneRuntime } from '../useVisualEditorSceneRuntime'

import type { SceneVisualProjectionState } from '~/stores/editor'

const {
  useCommandPanelBridgeBindingMock,
  useCommandPanelStoreMock,
  useEditSettingsStoreMock,
  useEditorStoreMock,
  useEditorViewStateStoreMock,
  usePreferenceStoreMock,
  useShortcutMock,
  useSidebarPanelBindingMock,
  useTabsStoreMock,
  useVisualEditorSceneViewportMock,
} = vi.hoisted(() => ({
  useCommandPanelBridgeBindingMock: vi.fn(),
  useCommandPanelStoreMock: vi.fn(),
  useEditSettingsStoreMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
  useEditorViewStateStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  useShortcutMock: vi.fn(),
  useSidebarPanelBindingMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useVisualEditorSceneViewportMock: vi.fn(),
}))

vi.mock('~/domain/document/scene-selection', () => ({
  computeLineNumberFromStatementId: vi.fn(() => 1),
  computeStatementIdFromLineNumber: vi.fn(() => 1),
}))

vi.mock('~/domain/script/sentence', () => ({
  buildStatements: vi.fn((rawText: string) => [{ id: 99, rawText }]),
}))

vi.mock('~/features/editor/shared/useEditorPanelBindings', () => ({
  useCommandPanelBridgeBinding: useCommandPanelBridgeBindingMock,
  useSidebarPanelBinding: useSidebarPanelBindingMock,
}))

vi.mock('~/features/editor/shortcut/useShortcut', () => ({
  useShortcut: useShortcutMock,
}))

vi.mock('~/features/editor/statement-editor/useStatementEditor', () => ({
  createStatementIdTarget: vi.fn((statementId: number) => ({
    kind: 'statement',
    statementId,
  })),
}))

vi.mock('~/features/editor/visual-editor/useVisualEditorSceneViewport', () => ({
  useVisualEditorSceneViewport: useVisualEditorSceneViewportMock,
}))

vi.mock('~/features/editor/visual-editor/visual-editor-focus', () => ({
  canRestoreVisualEditorCardFocus: vi.fn(() => true),
  findSelectedVisualEditorStatementCard: vi.fn(() => undefined),
}))

vi.mock('~/stores/command-panel', () => ({
  useCommandPanelStore: useCommandPanelStoreMock,
}))

vi.mock('~/stores/edit-settings', () => ({
  useEditSettingsStore: useEditSettingsStoreMock,
}))

vi.mock('~/stores/editor', () => ({
  isEditableEditor: (state: { projection?: string }) => 'projection' in state,
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/editor-view-state', () => ({
  useEditorViewStateStore: useEditorViewStateStoreMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

function createState(
  statements: {
    id: number
    parseError: boolean
    parsed: undefined
    rawText: string
  }[] = [{
    id: 1,
    parseError: false,
    parsed: undefined,
    rawText: 'say:hello',
  }],
): SceneVisualProjectionState {
  return reactive({
    isDirty: false,
    kind: 'scene' as const,
    path: '/project/scene.txt',
    projection: 'visual' as const,
    statements,
  }) as SceneVisualProjectionState
}

describe('useVisualEditorSceneRuntime 的快捷键注册与预览同步', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    useCommandPanelBridgeBindingMock.mockReset()
    useCommandPanelStoreMock.mockReset()
    useEditSettingsStoreMock.mockReset()
    useEditorStoreMock.mockReset()
    useEditorViewStateStoreMock.mockReset()
    usePreferenceStoreMock.mockReset()
    useShortcutMock.mockReset()
    useSidebarPanelBindingMock.mockReset()
    useTabsStoreMock.mockReset()
    useVisualEditorSceneViewportMock.mockReset()

    useCommandPanelStoreMock.mockReturnValue({
      getInsertText: vi.fn(() => 'say:test'),
    })
    useEditSettingsStoreMock.mockReturnValue(reactive({
      commandInsertPosition: 'after',
    }))
    useEditorStoreMock.mockReturnValue(reactive({
      applySceneStatementDelete: vi.fn(),
      applySceneStatementInsert: vi.fn(),
      applySceneStatementReorder: vi.fn(),
      applySceneStatementUpdate: vi.fn(),
      currentState: {
        kind: 'scene',
        path: '/project/scene.txt',
        projection: 'visual',
      },
      getSceneSelection: vi.fn(() => ({
        lastEditedStatementId: 1,
        lastLineNumber: 1,
        selectedStatementId: 1,
      })),
      isSceneStatementCollapsed: vi.fn(() => false),
      scheduleAutoSaveIfEnabled: vi.fn(),
      setSceneStatementCollapsed: vi.fn(),
      syncScenePreview: vi.fn(),
      syncSceneSelectionFromStatement: vi.fn(),
    }))
    useEditorViewStateStoreMock.mockReturnValue({
      consumeSessionRecoveryViewState: vi.fn(() => undefined),
      getPersistentViewState: vi.fn(() => undefined),
      updatePrimaryCursorLine: vi.fn(),
    })
    usePreferenceStoreMock.mockReturnValue(reactive({
      showSidebar: false,
    }))
    useTabsStoreMock.mockReturnValue(reactive({
      activeTab: {
        path: '/project/scene.txt',
      },
    }))
    useVisualEditorSceneViewportMock.mockReturnValue({
      isPositioning: computed(() => false),
      measureRowElement: vi.fn(),
      scrollToSelectedStatement: vi.fn(async () => undefined),
      totalSize: computed(() => 0),
      virtualRows: computed(() => []),
    })
    vi.mocked(computeLineNumberFromStatementId).mockImplementation((statements, statementId) => {
      const index = statements.findIndex(statement => statement.id === statementId)
      return index === -1 ? undefined : index + 1
    })
  })

  it('可视化场景的撤销和重做快捷键允许在输入框焦点下触发', () => {
    const scope = effectScope()
    const state = createState()

    scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => undefined,
      getState: () => state,
    }))

    expect(useShortcutMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      allowInInput: true,
      i18nKey: 'shortcut.visual.undo',
      id: 'visual.undo',
      keys: 'Mod+Z',
      when: {
        panelFocus: 'editor',
        visualType: 'scene',
      },
    }))
    expect(useShortcutMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      allowInInput: true,
      i18nKey: 'shortcut.visual.redo',
      id: 'visual.redo',
      keys: ['Mod+Shift+Z', 'Mod+Y'],
      when: {
        panelFocus: 'editor',
        visualType: 'scene',
      },
    }))

    scope.stop()
  })

  it('键盘重排语句后会同步实时预览到新的行号', async () => {
    const scope = effectScope()
    const state = createState([
      {
        id: 1,
        parseError: false,
        parsed: undefined,
        rawText: 'say:first',
      },
      {
        id: 2,
        parseError: false,
        parsed: undefined,
        rawText: 'say:second',
      },
    ])
    const selection = reactive({
      lastEditedStatementId: 1,
      lastLineNumber: 1,
      selectedStatementId: 1,
    })
    const syncScenePreview = vi.fn()
    const scheduleAutoSaveIfEnabled = vi.fn()
    const applySceneStatementReorder = vi.fn((_path: string, fromIndex: number, toIndex: number) => {
      const movedStatement = state.statements[fromIndex]
      if (!movedStatement) {
        return
      }

      state.statements.splice(fromIndex, 1)
      state.statements.splice(toIndex, 0, movedStatement)
      selection.lastEditedStatementId = movedStatement.id
      selection.selectedStatementId = movedStatement.id
      selection.lastLineNumber = toIndex + 1
    })

    useEditorStoreMock.mockReturnValue(reactive({
      applySceneStatementDelete: vi.fn(),
      applySceneStatementInsert: vi.fn(),
      applySceneStatementReorder,
      applySceneStatementUpdate: vi.fn(),
      currentState: {
        kind: 'scene',
        path: '/project/scene.txt',
        projection: 'visual',
      },
      getSceneSelection: vi.fn(() => selection),
      isSceneStatementCollapsed: vi.fn(() => false),
      scheduleAutoSaveIfEnabled,
      setSceneStatementCollapsed: vi.fn(),
      syncScenePreview,
      syncSceneSelectionFromStatement: vi.fn(),
    }))

    vi.stubGlobal('document', {
      activeElement: undefined,
    })

    scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => undefined,
      getState: () => state,
    }))

    const moveDownShortcut = useShortcutMock.mock.calls.find(([shortcut]) => shortcut.id === 'visual.moveDown')?.[0]
    expect(moveDownShortcut).toBeDefined()

    moveDownShortcut?.execute()
    await nextTick()

    expect(applySceneStatementReorder).toHaveBeenCalledWith('/project/scene.txt', 0, 1)
    expect(syncScenePreview).toHaveBeenCalledWith('/project/scene.txt', 2, 'say:first')
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/project/scene.txt')

    scope.stop()
  })
})
