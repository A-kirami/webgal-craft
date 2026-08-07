import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, reactive } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { computeLineNumberFromStatementId } from '~/domain/document/scene-selection'
import { buildStatements } from '~/domain/script/sentence'

import { useVisualEditorSceneRuntime } from '../useVisualEditorSceneRuntime'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { SceneVisualProjectionState } from '~/stores/editor'

const {
  findSelectedVisualEditorStatementCardMock,
  restoreSelectionAndScrollMock,
  scrollToSelectedStatementMock,
  useCommandPanelBridgeBindingMock,
  useCommandPanelStoreMock,
  useEditorStoreMock,
  useEditorViewStateStoreMock,
  usePreferenceStoreMock,
  useShortcutMock,
  useSidebarPanelBindingMock,
  useTabsStoreMock,
  useVisualEditorSceneViewportMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  findSelectedVisualEditorStatementCardMock: vi.fn(),
  restoreSelectionAndScrollMock: vi.fn(async () => undefined),
  scrollToSelectedStatementMock: vi.fn(async () => undefined),
  useCommandPanelBridgeBindingMock: vi.fn(),
  useCommandPanelStoreMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
  useEditorViewStateStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  useShortcutMock: vi.fn(),
  useSidebarPanelBindingMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useVisualEditorSceneViewportMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
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
  findSelectedVisualEditorStatementCard: findSelectedVisualEditorStatementCardMock,
}))

vi.mock('~/stores/command-panel', () => ({
  useCommandPanelStore: useCommandPanelStoreMock,
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

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
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

function createCallSceneSentence(args: ISentence['args'] = []): ISentence {
  return {
    args,
    command: commandType.callScene,
    commandRaw: 'callScene',
    content: 'battle.txt',
    endLine: 0,
    inlineComment: '',
    isLineBreakHolder: false,
    sentenceAssets: [],
    startLine: 0,
    subScene: [],
  }
}

describe('useVisualEditorSceneRuntime', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    findSelectedVisualEditorStatementCardMock.mockReset()
    findSelectedVisualEditorStatementCardMock.mockReturnValue(undefined)
    restoreSelectionAndScrollMock.mockReset()
    scrollToSelectedStatementMock.mockReset()
    useCommandPanelBridgeBindingMock.mockReset()
    useCommandPanelStoreMock.mockReset()
    useEditorStoreMock.mockReset()
    useEditorViewStateStoreMock.mockReset()
    usePreferenceStoreMock.mockReset()
    useShortcutMock.mockReset()
    useSidebarPanelBindingMock.mockReset()
    useTabsStoreMock.mockReset()
    useVisualEditorSceneViewportMock.mockReset()
    useWorkspaceStoreMock.mockReset()
    vi.mocked(buildStatements).mockImplementation((rawText: string) => [{
      id: 99,
      parseError: false,
      parsed: undefined,
      rawText,
    }])

    useCommandPanelStoreMock.mockReturnValue({
      getInsertText: vi.fn(() => 'say:test'),
    })
    useEditorStoreMock.mockReturnValue(reactive({
      applySceneStatementDelete: vi.fn(),
      applySceneStatementInsert: vi.fn(),
      applySceneStatementReorder: vi.fn(),
      applySceneStatementUpdate: vi.fn(),
      consumePendingSceneProjectionActivation: vi.fn(() => false),
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
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/games/demo',
      },
    }))
    useVisualEditorSceneViewportMock.mockReturnValue({
      isPositioning: computed(() => false),
      measureRowElement: vi.fn(),
      restoreSelectionAndScroll: restoreSelectionAndScrollMock,
      scrollToSelectedStatement: scrollToSelectedStatementMock,
      statementSortVirtualAdapter: {
        getEstimatedItemSize: vi.fn(() => 100),
        getItemCount: vi.fn(() => 0),
        getScrollOffset: vi.fn(() => 0),
        getVisibleItems: vi.fn(() => []),
        invalidate: vi.fn(),
      },
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

  it('Home 和 End 会选择场景首尾语句并按边界滚动，且不在输入框中放行', async () => {
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
      {
        id: 3,
        parseError: false,
        parsed: undefined,
        rawText: 'say:last',
      },
    ])
    const editorStore = useEditorStoreMock()
    const focus = vi.fn()
    class HTMLElementMock {
      focus = focus
    }
    const selectedCard = new HTMLElementMock()
    const viewportElement = {}

    vi.stubGlobal('document', {
      activeElement: undefined,
    })
    vi.stubGlobal('HTMLElement', HTMLElementMock)
    findSelectedVisualEditorStatementCardMock.mockReturnValue(selectedCard)

    scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => ({
        viewport: {
          viewportElement,
        },
      }) as never,
      getState: () => state,
    }))

    const homeShortcut = useShortcutMock.mock.calls.find(([shortcut]) => shortcut.id === 'visual.selectFirst')?.[0]
    const endShortcut = useShortcutMock.mock.calls.find(([shortcut]) => shortcut.id === 'visual.selectLast')?.[0]

    expect(homeShortcut).toMatchObject({
      keys: 'Home',
      when: {
        hasStatements: true,
        panelFocus: 'editor',
        visualType: 'scene',
      },
    })
    expect(endShortcut).toMatchObject({
      keys: 'End',
      when: {
        hasStatements: true,
        panelFocus: 'editor',
        visualType: 'scene',
      },
    })
    expect(homeShortcut).not.toHaveProperty('allowInInput')
    expect(endShortcut).not.toHaveProperty('allowInInput')

    await homeShortcut?.execute()
    expect(scrollToSelectedStatementMock).toHaveBeenCalledWith('start')
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(editorStore.syncSceneSelectionFromStatement).toHaveBeenLastCalledWith('/project/scene.txt', 1, {
      lastEditedStatementId: 1,
      lineNumber: 1,
    })

    await endShortcut?.execute()
    expect(scrollToSelectedStatementMock).toHaveBeenCalledWith('end')
    expect(editorStore.syncSceneSelectionFromStatement).toHaveBeenLastCalledWith('/project/scene.txt', 3, {
      lastEditedStatementId: 3,
      lineNumber: 3,
    })

    scope.stop()
  })

  it('命令面板点击插入会跟随当前选中语句', () => {
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
      {
        id: 3,
        parseError: false,
        parsed: undefined,
        rawText: 'say:third',
      },
    ])
    const applySceneStatementInsert = vi.fn()
    const scheduleAutoSaveIfEnabled = vi.fn()

    useEditorStoreMock.mockReturnValue(reactive({
      applySceneStatementDelete: vi.fn(),
      applySceneStatementInsert,
      applySceneStatementReorder: vi.fn(),
      applySceneStatementUpdate: vi.fn(),
      consumePendingSceneProjectionActivation: vi.fn(() => false),
      currentState: {
        kind: 'scene',
        path: '/project/scene.txt',
        projection: 'visual',
      },
      getSceneSelection: vi.fn(() => ({
        lastEditedStatementId: 2,
        lastLineNumber: 2,
        selectedStatementId: 2,
      })),
      isSceneStatementCollapsed: vi.fn(() => false),
      scheduleAutoSaveIfEnabled,
      setSceneStatementCollapsed: vi.fn(),
      syncScenePreview: vi.fn(),
      syncSceneSelectionFromStatement: vi.fn(),
    }))

    scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => undefined,
      getState: () => state,
    }))

    const commandBinding = useCommandPanelBridgeBindingMock.mock.calls.at(-1)?.[0]
    commandBinding?.insertCommand(commandType.say)

    expect(applySceneStatementInsert).toHaveBeenCalledWith('/project/scene.txt', [
      expect.objectContaining({ rawText: 'say:test' }),
    ], 2)
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/project/scene.txt')

    scope.stop()
  })

  it('rawText 未变化时会同步或清理编辑草稿', () => {
    const scope = effectScope()
    const state = createState([{
      id: 1,
      parseError: false,
      parsed: undefined,
      rawText: 'callScene:battle.txt;',
    }])
    const editorStore = useEditorStoreMock()
    const applySceneStatementUpdate = editorStore.applySceneStatementUpdate

    const runtime = scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => undefined,
      getState: () => state,
    }))
    const parsed = createCallSceneSentence()
    const draftParsed = createCallSceneSentence([{ key: '', value: '' }])

    runtime?.handleStatementUpdate({
      parsed,
      draftParsed,
      rawText: 'callScene:battle.txt;',
      target: { kind: 'statement', statementId: 1 },
    })

    expect(state.statements[0]?.draftParsed).toEqual(draftParsed)
    expect(applySceneStatementUpdate).not.toHaveBeenCalled()

    runtime?.handleStatementUpdate({
      parsed,
      rawText: 'callScene:battle.txt;',
      target: { kind: 'statement', statementId: 1 },
    })

    expect(state.statements[0]?.draftParsed).toBeUndefined()

    scope.stop()
  })

  it('原文变化时仍保留未提交的空参数草稿', () => {
    const scope = effectScope()
    const state = createState([{
      id: 1,
      parseError: false,
      parsed: undefined,
      rawText: 'callScene:battle.txt;',
    }])
    const editorStore = useEditorStoreMock()
    const applySceneStatementUpdate = editorStore.applySceneStatementUpdate
    applySceneStatementUpdate.mockImplementation((_path: string, _statementId: number, rawText: string) => {
      const entry = state.statements[0]!
      state.statements[0] = { ...entry, rawText }
    })

    const runtime = scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => undefined,
      getState: () => state,
    }))
    const parsed = createCallSceneSentence([{ key: 'difficulty', value: 'hard' }])
    const draftParsed = createCallSceneSentence([
      ...parsed.args,
      { key: '', value: '' },
      { key: '', value: '' },
    ])

    runtime?.handleStatementUpdate({
      parsed,
      draftParsed,
      rawText: 'callScene:battle.txt -difficulty=hard;',
      target: { kind: 'statement', statementId: 1 },
    })

    expect(applySceneStatementUpdate).toHaveBeenCalledWith(
      '/project/scene.txt',
      1,
      'callScene:battle.txt -difficulty=hard;',
      'visual',
    )
    expect(state.statements[0]?.draftParsed).toEqual(draftParsed)

    scope.stop()
  })

  it('消费可视化投影激活标记时会恢复选中项与滚动位置', async () => {
    const scope = effectScope()
    const state = createState()
    const consumePendingSceneProjectionActivation = vi.fn(() => true)

    useEditorStoreMock.mockReturnValue(reactive({
      applySceneStatementDelete: vi.fn(),
      applySceneStatementInsert: vi.fn(),
      applySceneStatementReorder: vi.fn(),
      applySceneStatementUpdate: vi.fn(),
      consumePendingSceneProjectionActivation,
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

    scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => undefined,
      getState: () => state,
    }))

    await nextTick()

    expect(consumePendingSceneProjectionActivation).toHaveBeenCalledWith('/project/scene.txt', 'visual')
    expect(restoreSelectionAndScrollMock).toHaveBeenCalledTimes(1)

    scope.stop()
  })

  it('脏场景切换选中语句时不会同步实时预览', () => {
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
    state.isDirty = true
    const syncScenePreview = vi.fn()
    const syncSceneSelectionFromStatement = vi.fn()

    useEditorStoreMock.mockReturnValue(reactive({
      applySceneStatementDelete: vi.fn(),
      applySceneStatementInsert: vi.fn(),
      applySceneStatementReorder: vi.fn(),
      applySceneStatementUpdate: vi.fn(),
      consumePendingSceneProjectionActivation: vi.fn(() => false),
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
      syncScenePreview,
      syncSceneSelectionFromStatement,
    }))

    const runtime = scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => undefined,
      getState: () => state,
    }))

    runtime?.handleSelect(2)

    expect(syncSceneSelectionFromStatement).toHaveBeenCalledWith('/project/scene.txt', 2, {
      lastEditedStatementId: 2,
      lineNumber: 2,
    })
    expect(syncScenePreview).not.toHaveBeenCalled()

    scope.stop()
  })

  it('键盘重排语句后不会自动同步实时预览', async () => {
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
      consumePendingSceneProjectionActivation: vi.fn(() => false),
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
    expect(syncScenePreview).not.toHaveBeenCalled()
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/project/scene.txt')
    expect(scrollToSelectedStatementMock).toHaveBeenCalledWith('auto')

    scope.stop()
  })

  it('拖拽重排语句时不会触发滚动恢复', () => {
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
    const applySceneStatementReorder = vi.fn()
    const scheduleAutoSaveIfEnabled = vi.fn()

    useEditorStoreMock.mockReturnValue(reactive({
      applySceneStatementDelete: vi.fn(),
      applySceneStatementInsert: vi.fn(),
      applySceneStatementReorder,
      applySceneStatementUpdate: vi.fn(),
      consumePendingSceneProjectionActivation: vi.fn(() => false),
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
      scheduleAutoSaveIfEnabled,
      setSceneStatementCollapsed: vi.fn(),
      syncScenePreview: vi.fn(),
      syncSceneSelectionFromStatement: vi.fn(),
    }))

    const runtime = scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => undefined,
      getState: () => state,
    }))

    runtime?.reorderStatements(0, 1, { restoreSelectionPresentation: false })

    expect(applySceneStatementReorder).toHaveBeenCalledWith('/project/scene.txt', 0, 1)
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/project/scene.txt')
    expect(scrollToSelectedStatementMock).not.toHaveBeenCalled()

    scope.stop()
  })

  it('文件投放到插入区会插入生成的语句并触发自动保存', () => {
    const scope = effectScope()
    const state = createState()
    const applySceneStatementInsert = vi.fn()
    const scheduleAutoSaveIfEnabled = vi.fn()

    useEditorStoreMock.mockReturnValue(reactive({
      applySceneStatementDelete: vi.fn(),
      applySceneStatementInsert,
      applySceneStatementReorder: vi.fn(),
      applySceneStatementUpdate: vi.fn(),
      consumePendingSceneProjectionActivation: vi.fn(() => false),
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
      scheduleAutoSaveIfEnabled,
      setSceneStatementCollapsed: vi.fn(),
      syncScenePreview: vi.fn(),
      syncSceneSelectionFromStatement: vi.fn(),
    }))

    const runtime = scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => undefined,
      getState: () => state,
    }))

    const applied = runtime?.handleFileDrop({
      source: 'file-viewer',
      type: 'file-system-item',
      path: '/games/demo/game/background/room.png',
      isDir: false,
    }, {
      placement: 'head',
      insertIndex: 0,
    })

    expect(applied).toBe(true)
    expect(applySceneStatementInsert).toHaveBeenCalledWith('/project/scene.txt', [expect.objectContaining({
      id: 99,
      rawText: 'changeBg:room.png;',
    })], 0)
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/project/scene.txt')

    scope.stop()
  })

  it('命令面板语句投放到插入区会插入 rawTexts 并触发自动保存', () => {
    const scope = effectScope()
    const state = createState()
    const applySceneStatementInsert = vi.fn()
    const scheduleAutoSaveIfEnabled = vi.fn()

    useEditorStoreMock.mockReturnValue(reactive({
      applySceneStatementDelete: vi.fn(),
      applySceneStatementInsert,
      applySceneStatementReorder: vi.fn(),
      applySceneStatementUpdate: vi.fn(),
      consumePendingSceneProjectionActivation: vi.fn(() => false),
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
      scheduleAutoSaveIfEnabled,
      setSceneStatementCollapsed: vi.fn(),
      syncScenePreview: vi.fn(),
      syncSceneSelectionFromStatement: vi.fn(),
    }))

    const runtime = scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => undefined,
      getState: () => state,
    }))

    const applied = runtime?.handleCommandDrop({
      label: 'Group',
      rawTexts: ['changeBg:room.png;', 'bgm:theme.ogg;'],
      source: 'command-panel',
      type: 'command-panel-statement',
    }, {
      placement: 'gap',
      insertIndex: 1,
    })

    expect(applied).toBe(true)
    expect(applySceneStatementInsert).toHaveBeenCalledWith('/project/scene.txt', [
      expect.objectContaining({ rawText: 'changeBg:room.png;' }),
      expect.objectContaining({ rawText: 'bgm:theme.ogg;' }),
    ], 1)
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/project/scene.txt')

    scope.stop()
  })

  it('命令面板语句投放到更新区会被拒绝', () => {
    const scope = effectScope()
    const state = createState()
    const applySceneStatementInsert = vi.fn()
    const applySceneStatementUpdate = vi.fn()

    useEditorStoreMock.mockReturnValue(reactive({
      applySceneStatementDelete: vi.fn(),
      applySceneStatementInsert,
      applySceneStatementReorder: vi.fn(),
      applySceneStatementUpdate,
      consumePendingSceneProjectionActivation: vi.fn(() => false),
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

    const runtime = scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => undefined,
      getState: () => state,
    }))
    const payload = {
      label: 'Say',
      rawTexts: ['say:new;'],
      source: 'command-panel' as const,
      type: 'command-panel-statement' as const,
    }
    const target = {
      placement: 'update' as const,
      insertIndex: 0,
      statementId: 1,
    }

    expect(runtime?.canHandleCommandDrop(payload, target)).toBe(false)
    expect(runtime?.handleCommandDrop(payload, target)).toBe(false)
    expect(applySceneStatementUpdate).not.toHaveBeenCalled()
    expect(applySceneStatementInsert).not.toHaveBeenCalled()

    scope.stop()
  })

  it('文件投放到插入区但未生成有效语句时会拒绝处理', () => {
    const scope = effectScope()
    const state = createState()
    const applySceneStatementInsert = vi.fn()
    const scheduleAutoSaveIfEnabled = vi.fn()

    vi.mocked(buildStatements).mockReturnValue([])
    useEditorStoreMock.mockReturnValue(reactive({
      applySceneStatementDelete: vi.fn(),
      applySceneStatementInsert,
      applySceneStatementReorder: vi.fn(),
      applySceneStatementUpdate: vi.fn(),
      consumePendingSceneProjectionActivation: vi.fn(() => false),
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
      scheduleAutoSaveIfEnabled,
      setSceneStatementCollapsed: vi.fn(),
      syncScenePreview: vi.fn(),
      syncSceneSelectionFromStatement: vi.fn(),
    }))

    const runtime = scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => undefined,
      getState: () => state,
    }))

    const applied = runtime?.handleFileDrop({
      source: 'file-viewer',
      type: 'file-system-item',
      path: '/games/demo/game/background/room.png',
      isDir: false,
    }, {
      placement: 'head',
      insertIndex: 0,
    })

    expect(applied).toBe(false)
    expect(applySceneStatementInsert).not.toHaveBeenCalled()
    expect(scrollToSelectedStatementMock).not.toHaveBeenCalled()
    expect(scheduleAutoSaveIfEnabled).not.toHaveBeenCalled()

    scope.stop()
  })

  it('文件投放到兼容更新区会更新原语句而不是插入', () => {
    const scope = effectScope()
    const state = createState([{
      id: 1,
      parseError: false,
      parsed: undefined,
      rawText: 'choose::a.txt;',
    }])
    const applySceneStatementInsert = vi.fn()
    const applySceneStatementUpdate = vi.fn()
    const scheduleAutoSaveIfEnabled = vi.fn()

    useEditorStoreMock.mockReturnValue(reactive({
      applySceneStatementDelete: vi.fn(),
      applySceneStatementInsert,
      applySceneStatementReorder: vi.fn(),
      applySceneStatementUpdate,
      consumePendingSceneProjectionActivation: vi.fn(() => false),
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
      scheduleAutoSaveIfEnabled,
      setSceneStatementCollapsed: vi.fn(),
      syncScenePreview: vi.fn(),
      syncSceneSelectionFromStatement: vi.fn(),
    }))

    const runtime = scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => undefined,
      getState: () => state,
    }))

    const applied = runtime?.handleFileDrop({
      source: 'file-viewer',
      type: 'file-system-item',
      path: '/games/demo/game/scene/chapter2.txt',
      isDir: false,
    }, {
      placement: 'update',
      insertIndex: 0,
      statementId: 1,
    })

    expect(applied).toBe(true)
    expect(applySceneStatementUpdate).toHaveBeenCalledWith(
      '/project/scene.txt',
      1,
      'choose::a.txt|:chapter2.txt;',
      'visual',
    )
    expect(applySceneStatementInsert).not.toHaveBeenCalled()
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/project/scene.txt')

    scope.stop()
  })

  it('文件投放到不兼容更新区会拒绝且不会降级为插入', () => {
    const scope = effectScope()
    const state = createState([{
      id: 1,
      parseError: false,
      parsed: undefined,
      rawText: 'changeBg:room.png;',
    }])
    const applySceneStatementInsert = vi.fn()
    const applySceneStatementUpdate = vi.fn()

    useEditorStoreMock.mockReturnValue(reactive({
      applySceneStatementDelete: vi.fn(),
      applySceneStatementInsert,
      applySceneStatementReorder: vi.fn(),
      applySceneStatementUpdate,
      consumePendingSceneProjectionActivation: vi.fn(() => false),
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

    const runtime = scope.run(() => useVisualEditorSceneRuntime({
      getScrollArea: () => undefined,
      getState: () => state,
    }))

    const target = {
      placement: 'update' as const,
      insertIndex: 0,
      statementId: 1,
    }
    const payload = {
      source: 'file-viewer' as const,
      type: 'file-system-item' as const,
      path: '/games/demo/game/bgm/theme.ogg',
      isDir: false,
    }

    expect(runtime?.canHandleFileDrop(payload, target)).toBe(false)
    expect(runtime?.handleFileDrop(payload, target)).toBe(false)
    expect(applySceneStatementUpdate).not.toHaveBeenCalled()
    expect(applySceneStatementInsert).not.toHaveBeenCalled()

    scope.stop()
  })
})
