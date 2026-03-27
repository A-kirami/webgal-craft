import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, reactive } from 'vue'

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

function createState(): SceneVisualProjectionState {
  return reactive({
    isDirty: false,
    kind: 'scene' as const,
    path: '/project/scene.txt',
    projection: 'visual' as const,
    statements: [
      {
        id: 1,
        parseError: false,
        parsed: undefined,
        rawText: 'say:hello',
      },
    ],
  }) as SceneVisualProjectionState
}

describe('useVisualEditorSceneRuntime 快捷键注册', () => {
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
})
