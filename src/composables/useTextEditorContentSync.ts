import * as monaco from 'monaco-editor'

import { isTextEditorModelPath } from '~/helper/text-editor-model-uri'
import { isAnimationDocumentTextValid } from '~/models/animation-document-codec'
import { useEditorStore } from '~/stores/editor'

import type { RestoreAfterModelSyncContext, TextEditorContentChangeContext } from './useTextEditorHistory'
import type { TextEditorCursorSnapshot } from '~/helper/text-editor-history-snapshot'
import type { TransactionSource } from '~/models/transaction'
import type { TextProjectionState } from '~/stores/editor'

interface TextEditorHistorySyncActions {
  captureContentChangeContext: (
    event: monaco.editor.IModelContentChangedEvent,
    previousContent: string,
  ) => TextEditorContentChangeContext
  captureDeferredContentChangeContext: () => TextEditorContentChangeContext
  captureEditorCursorSnapshot: () => TextEditorCursorSnapshot | undefined
  restoreAfterModelSync: (
    snapshot?: TextEditorCursorSnapshot,
    context?: RestoreAfterModelSyncContext,
    afterRestore?: () => void,
  ) => void
}

interface UseTextEditorContentSyncOptions {
  editorRef: ShallowRef<monaco.editor.IStandaloneCodeEditor | undefined>
  getState: () => TextProjectionState
  isComposing: () => boolean
  consumePendingTextTransactionSource: () => TransactionSource | undefined
  scheduleAutoSaveIfEnabled: () => void
  syncSceneSelection: (lineNumber: number | undefined) => void
  textEditorHistory: TextEditorHistorySyncActions
}

export function useTextEditorContentSync(options: UseTextEditorContentSyncOptions) {
  const editorStore = useEditorStore()
  const state = computed(() => options.getState())

  function readEditor(): monaco.editor.IStandaloneCodeEditor | undefined {
    return options.editorRef.value
  }

  function commitContentChange(context: TextEditorContentChangeContext) {
    const currentState = state.value
    const { cursorSnapshot: currentSnapshot, editorMetadata } = context

    const nextContent = readEditor()?.getModel()?.getValue() ?? ''
    const source = options.consumePendingTextTransactionSource() ?? 'text'

    if (currentState.kind === 'animation') {
      if (!isAnimationDocumentTextValid(nextContent)) {
        editorStore.setTextProjectionDraft(currentState.path, nextContent, 'invalid-animation-json')
        options.scheduleAutoSaveIfEnabled()
        return
      }

      editorStore.replaceTextDocumentContent(currentState.path, nextContent, {
        editorMetadata,
        preserveDraftText: true,
        source,
      })
      options.scheduleAutoSaveIfEnabled()
      return
    }

    editorStore.applyTextDocumentContent(currentState.path, nextContent, {
      editorMetadata,
      source,
    })
    if (currentState.kind === 'scene') {
      options.syncSceneSelection(
        currentSnapshot?.selections[0]?.positionLineNumber ?? readEditor()?.getPosition()?.lineNumber,
      )
    }

    options.scheduleAutoSaveIfEnabled()
  }

  function handleContentChange(event: monaco.editor.IModelContentChangedEvent) {
    if (event.isFlush || options.isComposing()) {
      return
    }

    commitContentChange(options.textEditorHistory.captureContentChangeContext(
      event,
      state.value.textContent,
    ))
  }

  function handleCompositionEnd() {
    queueMicrotask(() => {
      if (options.isComposing()) {
        return
      }

      const editor = readEditor()
      const nextContent = editor?.getModel()?.getValue()
      if (nextContent === undefined || nextContent === state.value.textContent) {
        return
      }

      commitContentChange(options.textEditorHistory.captureDeferredContentChangeContext())
    })
  }

  watch(() => state.value.textContent, (newContent) => {
    const editor = readEditor()
    if (!editor) {
      return
    }

    const model = editor.getModel()
    if (!model) {
      return
    }

    if (model.getValue() === newContent) {
      return
    }

    if (!isTextEditorModelPath(model.uri.toString(), state.value.path)) {
      return
    }

    const cursorSnapshot = options.textEditorHistory.captureEditorCursorSnapshot()
    const capturedPath = state.value.path
    model.setValue(newContent)

    nextTick(() => {
      options.textEditorHistory.restoreAfterModelSync(cursorSnapshot, {
        capturedModel: model,
        capturedPath,
      })
    })
  })

  return {
    handleContentChange,
    handleCompositionEnd,
  }
}
