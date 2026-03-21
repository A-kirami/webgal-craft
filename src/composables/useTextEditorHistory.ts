import { installTextEditorHistoryAdapter } from '~/helper/text-editor-history-adapter'
import {
  buildBeforeHistorySnapshotFromChangeEvent,
  captureCursorSnapshotFromEditor,
  captureEditorHistorySnapshot,
  computeHistoryCursorOffset,
  restoreEditorCursorOffset,
  restoreEditorCursorSnapshot,
  restoreEditorHistorySnapshot,
} from '~/helper/text-editor-history-snapshot'

import type * as monaco from 'monaco-editor'
import type { TextEditorHistoryAdapterHandle } from '~/helper/text-editor-history-adapter'
import type { TextEditorCursorSnapshot } from '~/helper/text-editor-history-snapshot'
import type { EditorHistoryMetadata, EditorHistorySnapshot } from '~/models/transaction'
import type { HistoryApplyResult, TextProjectionState } from '~/stores/editor'

export interface TextEditorContentChangeContext {
  cursorSnapshot?: TextEditorCursorSnapshot
  editorMetadata?: EditorHistoryMetadata
}

export interface RestoreAfterModelSyncContext {
  capturedModel?: monaco.editor.ITextModel
  capturedPath?: string
}

interface UseTextEditorHistoryOptions {
  editorRef: ShallowRef<monaco.editor.IStandaloneCodeEditor | undefined>
  getState: () => Pick<TextProjectionState, 'isDirty' | 'kind' | 'path' | 'syncError' | 'textContent'>
  isComposing: () => boolean
  handleCompositionEnd: () => void
  handleCompositionStart: () => void
  undoDocument: (path: string) => HistoryApplyResult
  redoDocument: (path: string) => HistoryApplyResult
  syncAnimationTextContentFromEditor: (path: string, content: string) => void
  scheduleAutoSaveIfEnabled: (path: string) => void
  syncSceneSelection: (lineNumber: number | undefined) => void
}

export function useTextEditorHistory(options: UseTextEditorHistoryOptions) {
  let installedEditor: monaco.editor.IStandaloneCodeEditor | undefined
  let historyAdapterHandle: TextEditorHistoryAdapterHandle | undefined

  // ── pending 状态组 ──
  // 这 4 个 ref 构成 "capture → apply → restore" 协作模式：
  // 1. undo/redo 时 capture 当前光标/快照，设置 pending 状态
  // 2. store 应用事务后触发 textContent 变更 → Monaco model.setValue
  // 3. model.setValue 触发 watch → nextTick 后调用 restoreAfterModelSync
  //    读取 pending 状态恢复光标，然后清除 pending
  //
  // pendingHistorySnapshot: undo/redo 时保存的精确光标快照（优先级最高）
  const pendingHistorySnapshot = ref<EditorHistorySnapshot>()
  // pendingHistoryCursorOffset: 无精确快照时的 fallback 光标偏移量
  const pendingHistoryCursorOffset = ref<number>()
  // shouldScheduleAutoSaveAfterHistoryApply: undo/redo 后是否需要请求自动保存
  const shouldScheduleAutoSaveAfterHistoryApply = ref(false)
  // pendingBeforeContentChangeSnapshot: 内容变更前捕获的光标快照，用于构建 editorMetadata.before
  const pendingBeforeContentChangeSnapshot = ref<TextEditorCursorSnapshot>()
  // lastObservedCursorSnapshot: 最近一次由 Monaco 光标/选区变化观测到的真实快照。
  // 对于拖拽移动这类不会稳定走 keydown/beforeinput 的复合编辑，作为 before 快照兜底。
  const lastObservedCursorSnapshot = ref<TextEditorCursorSnapshot>()

  function readEditor(): monaco.editor.IStandaloneCodeEditor | undefined {
    return options.editorRef.value
  }

  function readState() {
    return options.getState()
  }

  function hasInvalidAnimationText(): boolean {
    const state = readState()
    return state.kind === 'animation' && state.syncError !== undefined
  }

  function runNativeHistoryAction(
    actionId: 'editor.action.redo' | 'editor.action.undo',
  ) {
    const state = readState()
    const editor = readEditor()
    const savedModel = editor?.getModel()
    const beforeContent = savedModel?.getValue()
    const savedPath = state.path
    const savedKind = state.kind

    const runNativeAction = actionId === 'editor.action.undo'
      ? historyAdapterHandle?.runNativeUndo
      : historyAdapterHandle?.runNativeRedo

    setTimeout(() => {
      if (!savedModel || savedModel.isDisposed()) {
        return
      }

      if (readState().path !== savedPath || readEditor()?.getModel() !== savedModel) {
        return
      }

      const pendingNativeAction = runNativeAction?.()
      if (!pendingNativeAction) {
        return
      }

      void pendingNativeAction.then(() => {
        if (!savedModel || savedModel.isDisposed() || beforeContent === undefined) {
          return
        }

        const afterContent = savedModel.getValue()
        if (savedKind === 'animation' && afterContent !== beforeContent) {
          options.syncAnimationTextContentFromEditor(savedPath, afterContent)
        }
      })
    }, 0)
  }

  function captureEditorCursorSnapshot(): TextEditorCursorSnapshot | undefined {
    const editor = readEditor()
    if (!editor) {
      return
    }

    return captureCursorSnapshotFromEditor(editor)
  }

  function rememberCurrentCursorSnapshot() {
    lastObservedCursorSnapshot.value = captureEditorCursorSnapshot()
  }
  function captureBeforeContentChange() {
    pendingBeforeContentChangeSnapshot.value = captureEditorCursorSnapshot()
  }

  function buildEditorMetadata(
    beforeHistorySnapshot: EditorHistorySnapshot | undefined,
    cursorSnapshot: TextEditorCursorSnapshot | undefined,
  ): TextEditorContentChangeContext {
    const editorMetadata = beforeHistorySnapshot && cursorSnapshot
      ? {
          before: beforeHistorySnapshot,
          after: captureEditorHistorySnapshot(cursorSnapshot),
        }
      : undefined

    return {
      cursorSnapshot,
      editorMetadata,
    }
  }

  function buildContentChangeContext(
    event: monaco.editor.IModelContentChangedEvent,
    previousContent: string,
  ): TextEditorContentChangeContext {
    const cursorSnapshot = captureEditorCursorSnapshot()
    const beforeSnapshot = pendingBeforeContentChangeSnapshot.value ?? lastObservedCursorSnapshot.value
    const beforeHistorySnapshot = buildBeforeHistorySnapshotFromChangeEvent(
      event,
      previousContent,
      readEditor(),
      beforeSnapshot,
    )

    pendingBeforeContentChangeSnapshot.value = undefined
    return buildEditorMetadata(beforeHistorySnapshot, cursorSnapshot)
  }

  function captureDeferredContentChangeContext(): TextEditorContentChangeContext {
    const cursorSnapshot = captureEditorCursorSnapshot()
    const beforeSnapshot = pendingBeforeContentChangeSnapshot.value ?? lastObservedCursorSnapshot.value

    pendingBeforeContentChangeSnapshot.value = undefined
    return buildEditorMetadata(
      beforeSnapshot ? captureEditorHistorySnapshot(beforeSnapshot) : undefined,
      cursorSnapshot,
    )
  }

  /**
   * model.setValue 后在 nextTick 中调用，恢复光标并清除所有 pending 状态。
   * 优先级：pendingHistorySnapshot > pendingHistoryCursorOffset > 传入的 snapshot
   */
  function restoreAfterModelSync(
    snapshot?: TextEditorCursorSnapshot,
    context: RestoreAfterModelSyncContext = {},
    afterRestore?: () => void,
  ) {
    const editor = readEditor()
    if (!editor) {
      return
    }
    const currentPath = readState().path
    const currentModel = editor.getModel()
    const { capturedModel, capturedPath } = context
    const hasOriginMismatch = (
      (capturedModel !== undefined && currentModel !== capturedModel)
      || (capturedPath !== undefined && currentPath !== capturedPath)
    )

    if (hasOriginMismatch) {
      pendingHistorySnapshot.value = undefined
      pendingHistoryCursorOffset.value = undefined

      if (shouldScheduleAutoSaveAfterHistoryApply.value && capturedPath) {
        shouldScheduleAutoSaveAfterHistoryApply.value = false
        options.scheduleAutoSaveIfEnabled(capturedPath)
      }
      return
    }

    if (pendingHistorySnapshot.value) {
      const lineNumber = restoreEditorHistorySnapshot(editor, pendingHistorySnapshot.value)
      options.syncSceneSelection(lineNumber)
      pendingHistorySnapshot.value = undefined
      pendingHistoryCursorOffset.value = undefined
    } else if (pendingHistoryCursorOffset.value !== undefined) {
      const lineNumber = restoreEditorCursorOffset(editor, pendingHistoryCursorOffset.value, snapshot)
      options.syncSceneSelection(lineNumber)
      pendingHistoryCursorOffset.value = undefined
    } else if (snapshot) {
      const lineNumber = restoreEditorCursorSnapshot(editor, snapshot)
      options.syncSceneSelection(lineNumber)
    }

    if (shouldScheduleAutoSaveAfterHistoryApply.value) {
      shouldScheduleAutoSaveAfterHistoryApply.value = false
      options.scheduleAutoSaveIfEnabled(capturedPath ?? currentPath)
    }

    afterRestore?.()
  }

  function handleUndo() {
    if (hasInvalidAnimationText()) {
      if (!applyDocumentHistory('undo')) {
        runNativeHistoryAction('editor.action.undo')
      }
      return
    }

    applyDocumentHistory('undo')
  }

  function handleRedo() {
    if (hasInvalidAnimationText()) {
      if (!applyDocumentHistory('redo')) {
        runNativeHistoryAction('editor.action.redo')
      }
      return
    }

    applyDocumentHistory('redo')
  }

  function applyDocumentHistory(action: 'undo' | 'redo'): boolean {
    const state = readState()
    const previousContent = readEditor()?.getModel()?.getValue() ?? state.textContent
    const result = action === 'undo'
      ? options.undoDocument(state.path)
      : options.redoDocument(state.path)
    if (!result?.applied) {
      return false
    }

    pendingHistorySnapshot.value = action === 'undo'
      ? result.entry?.editorMetadata?.before
      : result.entry?.editorMetadata?.after
    if (!pendingHistorySnapshot.value) {
      pendingHistoryCursorOffset.value = computeHistoryCursorOffset(previousContent, state.textContent)
    }
    shouldScheduleAutoSaveAfterHistoryApply.value = state.isDirty
    return true
  }

  function installHistoryHandling() {
    const editor = readEditor()
    if (!editor) {
      return
    }

    if (editor === installedEditor && historyAdapterHandle) {
      return
    }

    historyAdapterHandle?.dispose()
    installedEditor = editor
    historyAdapterHandle = installTextEditorHistoryAdapter(editor, {
      captureBeforeContentChange,
      handleCompositionEnd: options.handleCompositionEnd,
      handleCompositionStart: options.handleCompositionStart,
      handleUndo,
      handleRedo,
      isComposing: options.isComposing,
    })
  }

  tryOnUnmounted(() => {
    historyAdapterHandle?.dispose()
    historyAdapterHandle = undefined
    installedEditor = undefined
  })

  return {
    captureBeforeContentChange,
    captureContentChangeContext: buildContentChangeContext,
    captureDeferredContentChangeContext,
    captureEditorCursorSnapshot,
    handleUndo,
    handleRedo,
    installHistoryHandling,
    rememberCurrentCursorSnapshot,
    restoreAfterModelSync,
  }
}
