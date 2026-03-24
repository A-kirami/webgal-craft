import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useTextEditorHistory } from '~/composables/useTextEditorHistory'

const { installTextEditorHistoryAdapterMock } = vi.hoisted(() => ({
  installTextEditorHistoryAdapterMock: vi.fn(),
}))

type UseTextEditorHistoryOptions = Parameters<typeof useTextEditorHistory>[0]

class Selection {
  selectionStartLineNumber: number
  selectionStartColumn: number
  positionLineNumber: number
  positionColumn: number
  endLineNumber: number
  endColumn: number

  constructor(
    selectionStartLineNumber: number,
    selectionStartColumn: number,
    positionLineNumber: number,
    positionColumn: number,
  ) {
    this.selectionStartLineNumber = selectionStartLineNumber
    this.selectionStartColumn = selectionStartColumn
    this.positionLineNumber = positionLineNumber
    this.positionColumn = positionColumn
    this.endLineNumber = positionLineNumber
    this.endColumn = positionColumn
  }

  getPosition() {
    return {
      lineNumber: this.positionLineNumber,
      column: this.positionColumn,
    }
  }
}

vi.mock('~/helper/text-editor-history-adapter', () => ({
  installTextEditorHistoryAdapter: installTextEditorHistoryAdapterMock,
}))

function createAdapterHandle(overrides: Partial<{
  dispose: ReturnType<typeof vi.fn>
  runNativeRedo: ReturnType<typeof vi.fn>
  runNativeUndo: ReturnType<typeof vi.fn>
}> = {}) {
  return {
    dispose: overrides.dispose ?? vi.fn(),
    runNativeRedo: overrides.runNativeRedo ?? vi.fn(async () => undefined),
    runNativeUndo: overrides.runNativeUndo ?? vi.fn(async () => undefined),
  }
}

function createEditorRef(editor: ReturnType<typeof createEditor>): UseTextEditorHistoryOptions['editorRef'] {
  return ref(editor) as unknown as UseTextEditorHistoryOptions['editorRef']
}

function createModel(content: string) {
  let currentContent = content

  function getOffsetAt(position: { lineNumber: number, column: number }) {
    const lines = currentContent.split('\n')
    let offset = 0
    for (let index = 0; index < position.lineNumber - 1; index++) {
      offset += lines[index].length + 1
    }
    return offset + position.column - 1
  }

  function getPositionAt(offset: number) {
    const safeOffset = Math.max(0, Math.min(offset, currentContent.length))
    const prefix = currentContent.slice(0, safeOffset)
    const lines = prefix.split('\n')
    return {
      lineNumber: lines.length,
      column: lines.at(-1)!.length + 1,
    }
  }

  return {
    getOffsetAt,
    getPositionAt,
    getValue: () => currentContent,
    getValueLength: () => currentContent.length,
    setValue(value: string) {
      currentContent = value
    },
    validateRange: (range: Selection) => range,
  }
}

function createEditor(content: string) {
  const model = createModel(content)
  const selection = new Selection(2, 1, 2, 6)
  const action = {
    run: vi.fn(async () => undefined),
  }

  return {
    addCommand: vi.fn(),
    getAction: vi.fn(() => action),
    getDomNode: vi.fn(() => undefined),
    getModel: vi.fn(() => model),
    getScrollLeft: vi.fn(() => 12),
    getScrollTop: vi.fn(() => 24),
    getSelections: vi.fn(() => [selection]),
    onKeyDown: vi.fn(() => ({ dispose: vi.fn() })),
    revealPositionInCenterIfOutsideViewport: vi.fn(),
    setScrollLeft: vi.fn(),
    setScrollTop: vi.fn(),
    setSelection: vi.fn(),
    setSelections: vi.fn(),
    action,
  }
}

describe('useTextEditorHistory', () => {
  beforeEach(() => {
    installTextEditorHistoryAdapterMock.mockReset()
    installTextEditorHistoryAdapterMock.mockReturnValue(createAdapterHandle())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('captureContentChangeContext 会生成 before/after 编辑器元数据快照', () => {
    const editor = createEditor('hello\nworld')
    editor.getSelections.mockReturnValue([new Selection(1, 2, 1, 4)])

    const history = useTextEditorHistory({
      editorRef: createEditorRef(editor),
      getState: () => ({
        isDirty: true,
        kind: 'scene',
        path: '/game/scene.txt',
        syncError: undefined,
        textContent: 'hlo\nworld',
      }),
      isComposing: () => false,
      handleCompositionEnd: vi.fn(),
      handleCompositionStart: vi.fn(),
      undoDocument: vi.fn(),
      redoDocument: vi.fn(),
      syncAnimationTextContentFromEditor: vi.fn(),
      scheduleAutoSaveIfEnabled: vi.fn(),
      syncSceneSelection: vi.fn(),
    })

    history.captureBeforeContentChange()
    const context = history.captureContentChangeContext({
      changes: [{
        range: {
          startLineNumber: 1,
          startColumn: 2,
          endLineNumber: 1,
          endColumn: 4,
        },
      }],
    } as never, 'hello\nworld')

    expect(context.cursorSnapshot).toEqual({
      selections: [expect.objectContaining({
        selectionStartLineNumber: 1,
        selectionStartColumn: 2,
        positionLineNumber: 1,
        positionColumn: 4,
      })],
      offsetSelections: [{
        selectionStartOffset: 1,
        positionOffset: 3,
      }],
      scrollTop: 24,
      scrollLeft: 12,
    })
    expect(context.editorMetadata).toEqual({
      before: {
        selections: [{
          selectionStartOffset: 1,
          positionOffset: 3,
        }],
        scrollTop: 24,
        scrollLeft: 12,
      },
      after: {
        selections: [{
          selectionStartOffset: 1,
          positionOffset: 3,
        }],
        scrollTop: 24,
        scrollLeft: 12,
      },
    })
  })

  it('captureDeferredContentChangeContext 会直接消费挂起的 before 快照', () => {
    const editor = createEditor('ni')
    editor.getSelections.mockReturnValue([new Selection(1, 2, 1, 3)])

    const history = useTextEditorHistory({
      editorRef: createEditorRef(editor),
      getState: () => ({
        isDirty: true,
        kind: 'scene',
        path: '/game/scene.txt',
        syncError: undefined,
        textContent: '',
      }),
      isComposing: () => false,
      handleCompositionEnd: vi.fn(),
      handleCompositionStart: vi.fn(),
      undoDocument: vi.fn(),
      redoDocument: vi.fn(),
      syncAnimationTextContentFromEditor: vi.fn(),
      scheduleAutoSaveIfEnabled: vi.fn(),
      syncSceneSelection: vi.fn(),
    })

    history.captureBeforeContentChange()
    const context = history.captureDeferredContentChangeContext()

    expect(context.editorMetadata).toEqual({
      before: {
        selections: [{
          selectionStartOffset: 1,
          positionOffset: 2,
        }],
        scrollTop: 24,
        scrollLeft: 12,
      },
      after: {
        selections: [{
          selectionStartOffset: 1,
          positionOffset: 2,
        }],
        scrollTop: 24,
        scrollLeft: 12,
      },
    })
  })

  it('单选区拖拽移动产生多段 change 时，before 快照仍保持单 selection', () => {
    const editor = createEditor('hello\nworld')

    const history = useTextEditorHistory({
      editorRef: createEditorRef(editor),
      getState: () => ({
        isDirty: true,
        kind: 'scene',
        path: '/game/scene.txt',
        syncError: undefined,
        textContent: 'world\nhello',
      }),
      isComposing: () => false,
      handleCompositionEnd: vi.fn(),
      handleCompositionStart: vi.fn(),
      undoDocument: vi.fn(),
      redoDocument: vi.fn(),
      syncAnimationTextContentFromEditor: vi.fn(),
      scheduleAutoSaveIfEnabled: vi.fn(),
      syncSceneSelection: vi.fn(),
    })

    history.captureBeforeContentChange()
    const context = history.captureContentChangeContext({
      changes: [
        {
          range: {
            startLineNumber: 2,
            startColumn: 1,
            endLineNumber: 2,
            endColumn: 6,
          },
        },
        {
          range: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1,
          },
        },
      ],
    } as never, 'hello\nworld')

    expect(context.editorMetadata?.before).toEqual({
      selections: [{
        selectionStartOffset: 6,
        positionOffset: 11,
      }],
      scrollTop: 24,
      scrollLeft: 12,
    })
  })

  it('编辑前快照会克隆 selections，避免被后续 Monaco 变更污染', () => {
    const editor = createEditor('hello\nworld')
    const first = new Selection(1, 1, 1, 1)
    const second = new Selection(2, 1, 2, 1)
    editor.getSelections.mockReturnValue([first, second])

    const history = useTextEditorHistory({
      editorRef: createEditorRef(editor),
      getState: () => ({
        isDirty: true,
        kind: 'scene',
        path: '/game/scene.txt',
        syncError: undefined,
        textContent: 'Xhello\nXworld',
      }),
      isComposing: () => false,
      handleCompositionEnd: vi.fn(),
      handleCompositionStart: vi.fn(),
      undoDocument: vi.fn(),
      redoDocument: vi.fn(),
      syncAnimationTextContentFromEditor: vi.fn(),
      scheduleAutoSaveIfEnabled: vi.fn(),
      syncSceneSelection: vi.fn(),
    })

    history.captureBeforeContentChange()

    first.selectionStartLineNumber = 1
    first.selectionStartColumn = 2
    first.positionLineNumber = 1
    first.positionColumn = 2
    second.selectionStartLineNumber = 2
    second.selectionStartColumn = 2
    second.positionLineNumber = 2
    second.positionColumn = 2

    const context = history.captureContentChangeContext({
      changes: [
        {
          range: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1,
          },
        },
        {
          range: {
            startLineNumber: 2,
            startColumn: 1,
            endLineNumber: 2,
            endColumn: 1,
          },
        },
      ],
    } as never, 'hello\nworld')

    expect(context.editorMetadata?.before).toEqual({
      selections: [
        { selectionStartOffset: 0, positionOffset: 0 },
        { selectionStartOffset: 6, positionOffset: 6 },
      ],
      scrollTop: 24,
      scrollLeft: 12,
    })
  })

  it('动画文本非法且统一历史不可用时，会回退到编辑器原生命令', async () => {
    const editor = createEditor('broken')
    const undoDocument = vi.fn(() => ({
      applied: false,
    }))
    const adapterHandle = createAdapterHandle({
      runNativeUndo: vi.fn(async () => {
        editor.action.run()
      }),
    })
    installTextEditorHistoryAdapterMock.mockReturnValueOnce(adapterHandle)
    editor.action.run.mockImplementation(async () => {
      editor.getModel().setValue('fixed')
    })
    const syncAnimationTextContentFromEditor = vi.fn()

    const history = useTextEditorHistory({
      editorRef: createEditorRef(editor),
      getState: () => ({
        isDirty: true,
        kind: 'animation',
        path: '/game/animation.json',
        syncError: 'invalid-animation-json',
        textContent: 'broken',
      }),
      isComposing: () => false,
      handleCompositionEnd: vi.fn(),
      handleCompositionStart: vi.fn(),
      undoDocument,
      redoDocument: vi.fn(),
      syncAnimationTextContentFromEditor,
      scheduleAutoSaveIfEnabled: vi.fn(),
      syncSceneSelection: vi.fn(),
    })

    history.installHistoryHandling()
    vi.useFakeTimers()
    history.handleUndo()
    await vi.runAllTimersAsync()

    expect(adapterHandle.runNativeUndo).toHaveBeenCalledTimes(1)
    expect(editor.action.run).toHaveBeenCalledTimes(1)
    expect(undoDocument).toHaveBeenCalledWith('/game/animation.json')
    expect(syncAnimationTextContentFromEditor).toHaveBeenCalledWith('/game/animation.json', 'fixed')
  })

  it('动画文本非法且统一历史可用时，会优先使用统一历史', async () => {
    const editor = createEditor('broken')
    const undoDocument = vi.fn(() => ({
      applied: true,
      entry: undefined,
    }))
    const syncAnimationTextContentFromEditor = vi.fn()

    const history = useTextEditorHistory({
      editorRef: createEditorRef(editor),
      getState: () => ({
        isDirty: true,
        kind: 'animation',
        path: '/game/animation.json',
        syncError: 'invalid-animation-json',
        textContent: 'broken',
      }),
      isComposing: () => false,
      handleCompositionEnd: vi.fn(),
      handleCompositionStart: vi.fn(),
      undoDocument,
      redoDocument: vi.fn(),
      syncAnimationTextContentFromEditor,
      scheduleAutoSaveIfEnabled: vi.fn(),
      syncSceneSelection: vi.fn(),
    })

    history.installHistoryHandling()
    vi.useFakeTimers()
    history.handleUndo()
    await vi.runAllTimersAsync()

    expect(editor.action.run).not.toHaveBeenCalled()
    expect(syncAnimationTextContentFromEditor).not.toHaveBeenCalled()
    expect(undoDocument).toHaveBeenCalledWith('/game/animation.json')
  })

  it('动画文本非法时若原生 undo 改变了编辑器内容，会主动同步回 store', async () => {
    const editor = createEditor('broken')
    const adapterHandle = createAdapterHandle({
      runNativeUndo: vi.fn(async () => {
        editor.action.run()
      }),
    })
    installTextEditorHistoryAdapterMock.mockReturnValueOnce(adapterHandle)
    editor.action.run.mockImplementation(async () => {
      editor.getModel().setValue('[{"duration":100}]')
    })
    const syncAnimationTextContentFromEditor = vi.fn()

    const history = useTextEditorHistory({
      editorRef: createEditorRef(editor),
      getState: () => ({
        isDirty: true,
        kind: 'animation',
        path: '/game/animation.json',
        syncError: 'invalid-animation-json',
        textContent: 'broken',
      }),
      isComposing: () => false,
      handleCompositionEnd: vi.fn(),
      handleCompositionStart: vi.fn(),
      undoDocument: vi.fn(() => ({
        applied: false,
      })),
      redoDocument: vi.fn(),
      syncAnimationTextContentFromEditor,
      scheduleAutoSaveIfEnabled: vi.fn(),
      syncSceneSelection: vi.fn(),
    })

    history.installHistoryHandling()
    vi.useFakeTimers()
    history.handleUndo()
    await vi.runAllTimersAsync()

    expect(syncAnimationTextContentFromEditor).toHaveBeenCalledWith(
      '/game/animation.json',
      '[{"duration":100}]',
    )
  })

  it('handleUndo + restoreAfterModelSync 会按偏移恢复光标并调度自动保存', () => {
    const editor = createEditor('before')
    const scheduleAutoSaveIfEnabled = vi.fn()
    const syncSceneSelection = vi.fn()

    const history = useTextEditorHistory({
      editorRef: createEditorRef(editor),
      getState: () => ({
        isDirty: true,
        kind: 'scene',
        path: '/game/scene.txt',
        syncError: undefined,
        textContent: 'after',
      }),
      isComposing: () => false,
      handleCompositionEnd: vi.fn(),
      handleCompositionStart: vi.fn(),
      undoDocument: vi.fn(() => ({
        applied: true,
        entry: undefined,
      })),
      redoDocument: vi.fn(),
      syncAnimationTextContentFromEditor: vi.fn(),
      scheduleAutoSaveIfEnabled,
      syncSceneSelection,
    })

    history.handleUndo()
    history.restoreAfterModelSync()

    expect(editor.setSelections).toHaveBeenCalledWith([
      expect.objectContaining({
        positionLineNumber: 1,
        positionColumn: 6,
      }),
    ])
    expect(syncSceneSelection).toHaveBeenCalledWith(1)
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/game/scene.txt')
  })

  it('缺少精确历史快照时，会按主光标位移同步恢复所有多光标位置', () => {
    const editor = createEditor('alpha\nbeta')
    const primary = new Selection(1, 6, 1, 6)
    const secondary = new Selection(2, 5, 2, 5)
    editor.getSelections.mockReturnValue([primary, secondary])

    const history = useTextEditorHistory({
      editorRef: createEditorRef(editor),
      getState: () => ({
        isDirty: true,
        kind: 'scene',
        path: '/game/scene.txt',
        syncError: undefined,
        textContent: 'alph\nbet',
      }),
      isComposing: () => false,
      handleCompositionEnd: vi.fn(),
      handleCompositionStart: vi.fn(),
      undoDocument: vi.fn(() => ({
        applied: true,
        entry: undefined,
      })),
      redoDocument: vi.fn(),
      syncAnimationTextContentFromEditor: vi.fn(),
      scheduleAutoSaveIfEnabled: vi.fn(),
      syncSceneSelection: vi.fn(),
    })

    history.handleUndo()
    history.restoreAfterModelSync({
      selections: [primary, secondary] as never,
      offsetSelections: [
        { selectionStartOffset: 5, positionOffset: 5 },
        { selectionStartOffset: 10, positionOffset: 10 },
      ],
      scrollTop: 24,
      scrollLeft: 12,
    })

    expect(editor.setSelections).toHaveBeenCalledWith([
      expect.objectContaining({
        selectionStartLineNumber: 2,
        selectionStartColumn: 3,
        positionLineNumber: 2,
        positionColumn: 3,
      }),
      expect.objectContaining({
        selectionStartLineNumber: 2,
        selectionStartColumn: 5,
        positionLineNumber: 2,
        positionColumn: 5,
      }),
    ])
  })

  it('installHistoryHandling 对同一 editor 实例不会重复安装适配器', () => {
    const editor = createEditor('hello')
    const firstDispose = vi.fn()

    installTextEditorHistoryAdapterMock
      .mockReturnValueOnce(createAdapterHandle({
        dispose: firstDispose,
      }))

    const history = useTextEditorHistory({
      editorRef: createEditorRef(editor),
      getState: () => ({
        isDirty: false,
        kind: 'scene',
        path: '/game/scene.txt',
        syncError: undefined,
        textContent: 'hello',
      }),
      isComposing: () => false,
      handleCompositionEnd: vi.fn(),
      handleCompositionStart: vi.fn(),
      undoDocument: vi.fn(),
      redoDocument: vi.fn(),
      syncAnimationTextContentFromEditor: vi.fn(),
      scheduleAutoSaveIfEnabled: vi.fn(),
      syncSceneSelection: vi.fn(),
    })

    history.installHistoryHandling()
    history.installHistoryHandling()

    expect(firstDispose).not.toHaveBeenCalled()
    expect(installTextEditorHistoryAdapterMock).toHaveBeenCalledTimes(1)
  })
})
