import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, shallowRef } from 'vue'

import { useTextEditorRuntime } from '~/features/editor/text-editor/useTextEditorRuntime'

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
  useTextEditorBindings: vi.fn(() => ({
    consumePendingTextTransactionSource: vi.fn(),
    handleCursorSelectionChange: vi.fn(),
  })),
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

function createEditor() {
  return {
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

function flushRuntimeWatchers() {
  return nextTick().then(() => nextTick())
}

describe('useTextEditorRuntime 预览同步', () => {
  beforeEach(() => {
    applySceneCursorTargetMock.mockReset()
    didResumeSingleEditTargetMock.mockReset()
    prepareSceneCursorTargetMock.mockReset()
    readEditorHasMultipleEditTargetsMock.mockReset()
    resolveSceneCursorTargetMock.mockClear()
    resolveScenePreviewLineMock.mockClear()
    useEditorStoreMock.mockReset()
    useTabsStoreMock.mockReset()

    didResumeSingleEditTargetMock.mockReturnValue(false)
    readEditorHasMultipleEditTargetsMock.mockReturnValue(false)

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
