import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, shallowRef } from 'vue'

import { useTextEditorRuntime } from '~/features/editor/text-editor/useTextEditorRuntime'

import type * as monaco from 'monaco-editor'
import type { TextProjectionState } from '~/stores/editor'

const {
  applySceneCursorTargetMock,
  didResumeSingleEditTargetMock,
  prepareSceneCursorTargetMock,
  readEditorHasMultipleEditTargetsMock,
  resolveSceneCursorTargetMock,
  resolveScenePreviewLineMock,
  useEditorStoreMock,
  useTabsStoreMock,
  useTextEditorBindingsMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  applySceneCursorTargetMock: vi.fn(),
  didResumeSingleEditTargetMock: vi.fn(() => false),
  prepareSceneCursorTargetMock: vi.fn(),
  readEditorHasMultipleEditTargetsMock: vi.fn(() => false),
  resolveSceneCursorTargetMock: vi.fn(() => ({
    shouldUpdatePosition: true,
    targetPosition: {
      column: 1,
      lineNumber: 2,
    },
  })),
  resolveScenePreviewLineMock: vi.fn(() => ({
    lineNumber: 2,
    lineText: 'beta',
  })),
  useEditorStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useTextEditorBindingsMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('monaco-editor', () => ({
  languages: {
    getLanguages: vi.fn(() => []),
  },
  editor: {
    CursorChangeReason: {
      ContentFlush: 1,
      NotSet: 0,
    },
    ScrollType: {
      Immediate: 0,
    },
  },
}))

vi.mock('~/features/editor/text-editor/text-editor-language', () => ({
  resolveTextEditorLanguage: vi.fn(() => 'webgal'),
}))

vi.mock('~/features/editor/text-editor/text-editor-scene-restore', () => ({
  applySceneCursorTarget: applySceneCursorTargetMock,
  prepareSceneCursorTarget: prepareSceneCursorTargetMock,
}))

vi.mock('~/features/editor/text-editor/text-editor-scene-sync', () => ({
  resolveSceneCursorTarget: resolveSceneCursorTargetMock,
  resolveScenePreviewLine: resolveScenePreviewLineMock,
}))

vi.mock('~/features/editor/text-editor/text-editor-selection', () => ({
  didResumeSingleEditTarget: didResumeSingleEditTargetMock,
  readEditorHasMultipleEditTargets: readEditorHasMultipleEditTargetsMock,
}))

vi.mock('~/features/editor/text-editor/useTextEditorBindings', () => ({
  useTextEditorBindings: useTextEditorBindingsMock,
}))

vi.mock('~/features/editor/text-editor/useTextEditorContentSync', () => ({
  useTextEditorContentSync: vi.fn(() => ({
    handleCompositionEnd: vi.fn(),
    handleContentChange: vi.fn(),
  })),
}))

vi.mock('~/features/editor/text-editor/useTextEditorHistory', () => ({
  useTextEditorHistory: vi.fn(() => ({
    captureBeforeContentChange: vi.fn(),
    handleCompositionEnd: vi.fn(),
    installHistoryHandling: vi.fn(),
    rememberCurrentCursorSnapshot: vi.fn(),
  })),
}))

vi.mock('~/features/editor/text-editor/useTextEditorPanel', () => ({
  useTextEditorPanel: vi.fn(() => ({})),
}))

vi.mock('~/features/editor/text-editor/useTextEditorWorkspace', () => ({
  useTextEditorWorkspace: vi.fn(() => ({
    ensureModel: vi.fn(),
    markEditorCreated: vi.fn(),
    markFileInteracted: vi.fn(),
    markFileOpened: vi.fn(),
    restoreViewState: vi.fn(),
    saveViewState: vi.fn(),
    switchModel: vi.fn(),
    syncCurrentModelLanguage: vi.fn(),
  })),
}))

vi.mock('~/stores/editor', () => ({
  isEditableEditor: (state: { projection?: string }) => 'projection' in state,
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

function createState(path: string): TextProjectionState {
  return reactive({
    isDirty: false,
    kind: 'scene' as const,
    path,
    projection: 'text' as const,
    textContent: 'alpha\nbeta',
    textSource: 'projection' as const,
  }) as TextProjectionState
}

interface EditorDouble {
  createDecorationsCollection: ReturnType<typeof vi.fn>
  getModel: ReturnType<typeof vi.fn<() => Pick<monaco.editor.ITextModel, 'getLineContent' | 'getLineCount' | 'getLineMaxColumn'>>>
  getPosition: ReturnType<typeof vi.fn>
}

function createEditor(): EditorDouble {
  return {
    createDecorationsCollection: vi.fn(() => ({
      clear: vi.fn(),
      set: vi.fn((decorations: readonly unknown[]) =>
        decorations.map((_, index) => `decoration-${index + 1}`),
      ),
    })),
    getModel: vi.fn(() => ({
      getLineContent: vi.fn((lineNumber: number) => lineNumber === 2 ? 'beta' : 'alpha'),
      getLineCount: vi.fn(() => 2),
      getLineMaxColumn: vi.fn(() => 5),
    })),
    getPosition: vi.fn(() => ({
      column: 1,
      lineNumber: 2,
    })),
  }
}

function createEditableEditorStore(path: string) {
  return reactive({
    currentState: {
      kind: 'scene',
      path,
      projection: 'text' as const,
    },
    getSceneSelection: vi.fn(() => ({
      lastLineNumber: 2,
      selectedStatementId: 1,
    })),
    getState: vi.fn(),
    redoDocument: vi.fn(),
    registerSaveHook: vi.fn(),
    replaceTextDocumentContent: vi.fn(),
    scheduleAutoSaveIfEnabled: vi.fn(),
    consumePendingSceneProjectionActivation: vi.fn(() => false),
    setTextProjectionDraft: vi.fn(),
    syncScenePreview: vi.fn(),
    syncSceneSelectionFromTextLine: vi.fn(),
    undoDocument: vi.fn(),
    unregisterSaveHook: vi.fn(),
  })
}

function createTabsStore(path: string) {
  return reactive({
    activeTab: {
      isPreview: false,
      path,
    },
    shouldFocusEditor: false,
    tabs: [{ path }],
  })
}

function flushRuntimeWatchers() {
  return nextTick().then(() => nextTick())
}

describe('useTextEditorRuntime', () => {
  beforeEach(() => {
    applySceneCursorTargetMock.mockReset()
    didResumeSingleEditTargetMock.mockReset()
    prepareSceneCursorTargetMock.mockReset()
    readEditorHasMultipleEditTargetsMock.mockReset()
    resolveSceneCursorTargetMock.mockClear()
    resolveScenePreviewLineMock.mockClear()
    useEditorStoreMock.mockReset()
    useTabsStoreMock.mockReset()
    useTextEditorBindingsMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    didResumeSingleEditTargetMock.mockReturnValue(false)
    readEditorHasMultipleEditTargetsMock.mockReturnValue(false)
    useWorkspaceStoreMock.mockReturnValue({
      currentGame: {
        path: '/games/demo',
      },
    })
    useTextEditorBindingsMock.mockReturnValue({
      applyProgrammaticInsert: vi.fn(() => true),
      applyProgrammaticStatementUpdate: vi.fn(() => true),
      consumePendingTextTransactionSource: vi.fn(),
      handleCursorSelectionChange: vi.fn(),
    })

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('消费文本投影激活标记时会恢复光标位置且不会同步预览', async () => {
    const path = '/project/scene.txt'
    const state = createState(path)
    const editor = createEditor()
    const editorStore = reactive({
      currentState: {
        kind: 'scene',
        path,
        projection: 'visual' as const,
      } as {
        kind: 'scene'
        path: string
        projection: 'text' | 'visual'
      },
      getSceneSelection: vi.fn(() => ({
        lastLineNumber: 2,
        selectedStatementId: 1,
      })),
      getState: vi.fn(),
      redoDocument: vi.fn(),
      registerSaveHook: vi.fn(),
      replaceTextDocumentContent: vi.fn(),
      scheduleAutoSaveIfEnabled: vi.fn(),
      consumePendingSceneProjectionActivation: vi.fn(() => true),
      setTextProjectionDraft: vi.fn(),
      syncScenePreview: vi.fn(),
      syncSceneSelectionFromTextLine: vi.fn(),
      undoDocument: vi.fn(),
      unregisterSaveHook: vi.fn(),
    })
    const tabsStore = reactive({
      activeTab: {
        isPreview: false,
        path,
      },
      shouldFocusEditor: false,
      tabs: [{ path }],
    })

    useEditorStoreMock.mockReturnValue(editorStore)
    useTabsStoreMock.mockReturnValue(tabsStore)

    const scope = effectScope()
    scope.run(() => {
      useTextEditorRuntime({
        editorRef: shallowRef(editor) as never,
        getState: () => state,
      })
    })

    await flushRuntimeWatchers()
    prepareSceneCursorTargetMock.mockClear()
    applySceneCursorTargetMock.mockClear()
    editorStore.syncScenePreview.mockClear()

    editorStore.currentState = {
      kind: 'scene',
      path,
      projection: 'text',
    }

    await flushRuntimeWatchers()

    expect(prepareSceneCursorTargetMock).toHaveBeenCalledTimes(1)
    expect(applySceneCursorTargetMock).toHaveBeenCalledTimes(1)
    expect(editorStore.syncScenePreview).not.toHaveBeenCalled()

    scope.stop()
  })

  it('同一行内移动光标时不会重复同步预览', () => {
    const path = '/project/scene-same-line.txt'
    const state = createState(path)
    const editorStore = reactive({
      currentState: {
        kind: 'scene',
        path,
        projection: 'text' as const,
      },
      getSceneSelection: vi.fn(() => ({
        lastLineNumber: 2,
        selectedStatementId: 1,
      })),
      getState: vi.fn(),
      redoDocument: vi.fn(),
      registerSaveHook: vi.fn(),
      replaceTextDocumentContent: vi.fn(),
      scheduleAutoSaveIfEnabled: vi.fn(),
      consumePendingSceneProjectionActivation: vi.fn(() => false),
      setTextProjectionDraft: vi.fn(),
      syncScenePreview: vi.fn(),
      syncSceneSelectionFromTextLine: vi.fn(),
      undoDocument: vi.fn(),
      unregisterSaveHook: vi.fn(),
    })
    const tabsStore = reactive({
      activeTab: {
        isPreview: false,
        path,
      },
      shouldFocusEditor: false,
      tabs: [{ path }],
    })

    useEditorStoreMock.mockReturnValue(editorStore)
    useTabsStoreMock.mockReturnValue(tabsStore)

    const runtime = useTextEditorRuntime({
      editorRef: shallowRef(createEditor()) as never,
      getState: () => state,
    })

    runtime.handleCursorPositionChange({
      position: {
        column: 4,
        lineNumber: 2,
      },
      reason: 3,
    } as never)

    expect(editorStore.syncSceneSelectionFromTextLine).not.toHaveBeenCalled()
    expect(editorStore.syncScenePreview).not.toHaveBeenCalled()
  })

  it('文件投放更新语句时会保留 external 事务来源', () => {
    const path = '/project/scene-file-drop-update.txt'
    const state = createState(path)
    const editor = {
      ...createEditor(),
      getTargetAtClientPoint: vi.fn(() => ({
        position: {
          column: 10,
          lineNumber: 1,
        },
      })),
    }
    editor.getModel.mockReturnValue({
      getLineContent: vi.fn(() => 'changeBg:old.png;'),
      getLineCount: vi.fn(() => 1),
      getLineMaxColumn: vi.fn(() => 18),
    })
    const applyProgrammaticStatementUpdate = vi.fn(() => true)

    useEditorStoreMock.mockReturnValue(createEditableEditorStore(path))
    useTabsStoreMock.mockReturnValue(createTabsStore(path))
    useTextEditorBindingsMock.mockReturnValue({
      applyProgrammaticInsert: vi.fn(() => false),
      applyProgrammaticStatementUpdate,
      consumePendingTextTransactionSource: vi.fn(),
      handleCursorSelectionChange: vi.fn(),
    })

    const runtime = useTextEditorRuntime({
      editorRef: shallowRef(editor) as never,
      getState: () => state,
    })

    expect(runtime.handleFileDrop({
      source: 'file-viewer',
      type: 'file-system-item',
      path: '/games/demo/game/background/room.png',
      isDir: false,
    }, {
      x: 100,
      y: 40,
    })).toBe(true)

    expect(applyProgrammaticStatementUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        rawText: 'changeBg:room.png;',
      }),
      'external',
    )
  })

  it('命令面板语句投放会通过 external 事务来源插入文本', () => {
    const path = '/project/scene-command-drop.txt'
    const state = createState(path)
    const editor = {
      ...createEditor(),
      getTargetAtClientPoint: vi.fn(() => ({
        position: {
          column: 5,
          lineNumber: 1,
        },
      })),
    }
    editor.getModel.mockReturnValue({
      getLineContent: vi.fn(() => 'say:hello;'),
      getLineCount: vi.fn(() => 1),
      getLineMaxColumn: vi.fn(() => 11),
    })
    const applyProgrammaticInsert = vi.fn(() => true)

    useEditorStoreMock.mockReturnValue(createEditableEditorStore(path))
    useTabsStoreMock.mockReturnValue(createTabsStore(path))
    useTextEditorBindingsMock.mockReturnValue({
      applyProgrammaticInsert,
      applyProgrammaticStatementUpdate: vi.fn(() => false),
      consumePendingTextTransactionSource: vi.fn(),
      handleCursorSelectionChange: vi.fn(),
    })

    const runtime = useTextEditorRuntime({
      editorRef: shallowRef(editor) as never,
      getState: () => state,
    })

    expect(runtime.handleCommandDrop({
      label: 'Say',
      rawTexts: ['say:new;'],
      source: 'command-panel',
      type: 'command-panel-statement',
    }, {
      x: 100,
      y: 40,
    })).toBe(true)

    expect(applyProgrammaticInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'insert-statement-line',
        text: '\nsay:new;',
      }),
      'external',
    )
  })

  it('命令面板语句投放插入新行后会选中新插入语句', () => {
    const path = '/project/scene-command-drop-selection.txt'
    const state = createState(path)
    const editor = {
      ...createEditor(),
      getTargetAtClientPoint: vi.fn(() => ({
        position: {
          column: 5,
          lineNumber: 1,
        },
      })),
    }
    editor.getModel.mockReturnValue({
      getLineContent: vi.fn(() => 'say:old;'),
      getLineCount: vi.fn(() => 1),
      getLineMaxColumn: vi.fn(() => 9),
    })
    const applyProgrammaticInsert = vi.fn(() => true)
    const editorStore = createEditableEditorStore(path)

    useEditorStoreMock.mockReturnValue(editorStore)
    useTabsStoreMock.mockReturnValue(createTabsStore(path))
    useTextEditorBindingsMock.mockReturnValue({
      applyProgrammaticInsert,
      applyProgrammaticStatementUpdate: vi.fn(() => false),
      consumePendingTextTransactionSource: vi.fn(),
      handleCursorSelectionChange: vi.fn(),
    })

    const runtime = useTextEditorRuntime({
      editorRef: shallowRef(editor) as never,
      getState: () => state,
    })

    expect(runtime.handleCommandDrop({
      label: 'Say',
      rawTexts: ['say:new;'],
      source: 'command-panel',
      type: 'command-panel-statement',
    }, {
      x: 100,
      y: 40,
    })).toBe(true)

    expect(editorStore.syncSceneSelectionFromTextLine).toHaveBeenCalledWith(path, 2)
  })

  it('跨行移动光标时会同步预览到新的关注行', () => {
    const path = '/project/scene-cross-line.txt'
    const state = createState(path)
    const editorStore = reactive({
      currentState: {
        kind: 'scene',
        path,
        projection: 'text' as const,
      },
      getSceneSelection: vi.fn(() => ({
        lastLineNumber: 1,
        selectedStatementId: 1,
      })),
      getState: vi.fn(),
      redoDocument: vi.fn(),
      registerSaveHook: vi.fn(),
      replaceTextDocumentContent: vi.fn(),
      scheduleAutoSaveIfEnabled: vi.fn(),
      consumePendingSceneProjectionActivation: vi.fn(() => false),
      setTextProjectionDraft: vi.fn(),
      syncScenePreview: vi.fn(),
      syncSceneSelectionFromTextLine: vi.fn(),
      undoDocument: vi.fn(),
      unregisterSaveHook: vi.fn(),
    })
    const tabsStore = reactive({
      activeTab: {
        isPreview: false,
        path,
      },
      shouldFocusEditor: false,
      tabs: [{ path }],
    })

    useEditorStoreMock.mockReturnValue(editorStore)
    useTabsStoreMock.mockReturnValue(tabsStore)

    const runtime = useTextEditorRuntime({
      editorRef: shallowRef(createEditor()) as never,
      getState: () => state,
    })

    runtime.handleCursorPositionChange({
      position: {
        column: 1,
        lineNumber: 2,
      },
      reason: 3,
    } as never)

    expect(editorStore.syncSceneSelectionFromTextLine).toHaveBeenCalledWith(path, 2)
    expect(editorStore.syncScenePreview).toHaveBeenCalledWith(path, 2, 'beta')
  })

  it('从多目标恢复为单目标时会同步预览到当前关注行', () => {
    const path = '/project/scene-selection-resume.txt'
    const state = createState(path)
    const editorStore = reactive({
      currentState: {
        kind: 'scene',
        path,
        projection: 'text' as const,
      },
      getSceneSelection: vi.fn(() => ({
        lastLineNumber: 1,
        selectedStatementId: 1,
      })),
      getState: vi.fn(),
      redoDocument: vi.fn(),
      registerSaveHook: vi.fn(),
      replaceTextDocumentContent: vi.fn(),
      scheduleAutoSaveIfEnabled: vi.fn(),
      consumePendingSceneProjectionActivation: vi.fn(() => false),
      setTextProjectionDraft: vi.fn(),
      syncScenePreview: vi.fn(),
      syncSceneSelectionFromTextLine: vi.fn(),
      undoDocument: vi.fn(),
      unregisterSaveHook: vi.fn(),
    })
    const tabsStore = reactive({
      activeTab: {
        isPreview: false,
        path,
      },
      shouldFocusEditor: false,
      tabs: [{ path }],
    })

    useEditorStoreMock.mockReturnValue(editorStore)
    useTabsStoreMock.mockReturnValue(tabsStore)
    didResumeSingleEditTargetMock.mockReturnValue(true)

    const runtime = useTextEditorRuntime({
      editorRef: shallowRef(createEditor()) as never,
      getState: () => state,
    })

    runtime.handleCursorSelectionChange({
      selection: {
        positionLineNumber: 2,
      },
    } as never)

    expect(editorStore.syncSceneSelectionFromTextLine).toHaveBeenCalledWith(path, 2)
    expect(editorStore.syncScenePreview).toHaveBeenCalledWith(path, 2, 'beta')
  })
})
