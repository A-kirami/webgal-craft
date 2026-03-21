import {
  createEmptySceneTextPanelSnapshot,
  resolveSceneTextPanelSnapshotFromContent,
} from '~/helper/scene-text-panel'

import { createTextLineTarget } from './useStatementEditor'

import type { StatementUpdatePayload } from './useStatementEditor'
import type * as monaco from 'monaco-editor'
import type { TransactionSource } from '~/models/transaction'
import type { TextProjectionState } from '~/stores/editor'

interface TextEditorSidebarPanelBindings {
  handleFormUpdate: (payload: StatementUpdatePayload) => boolean
}

type TextEditorHistoryCoordinator = ReturnType<typeof useTextEditorHistory>

interface UseTextEditorBindingsOptions {
  editorRef: ShallowRef<monaco.editor.IStandaloneCodeEditor | undefined>
  getState: () => TextProjectionState
  isCurrentTextProjectionActive: () => boolean
  formPanel: TextEditorSidebarPanelBindings
  textEditorHistory: TextEditorHistoryCoordinator
}

export function useTextEditorBindings(options: UseTextEditorBindingsOptions) {
  const editorStore = useEditorStore()
  const editSettings = useEditSettingsStore()
  const commandPanelStore = useCommandPanelStore()
  const state = computed(() => options.getState())

  let pendingTextTransactionSource: TransactionSource | undefined

  function readEditor(): monaco.editor.IStandaloneCodeEditor | undefined {
    return options.editorRef.value
  }

  const sidebarSnapshot = computed(() => {
    const currentState = state.value
    if (currentState.kind !== 'scene') {
      return createEmptySceneTextPanelSnapshot()
    }

    const lineNumber = editorStore.getSceneSelection(currentState.path)?.lastLineNumber
    if (lineNumber === undefined) {
      return createEmptySceneTextPanelSnapshot()
    }

    return resolveSceneTextPanelSnapshotFromContent(lineNumber, currentState.textContent)
  })

  function handleSidebarUpdate(payload: StatementUpdatePayload) {
    pendingTextTransactionSource = payload.source ?? 'visual'
    if (!options.formPanel.handleFormUpdate(payload)) {
      pendingTextTransactionSource = undefined
    }
  }

  useSidebarPanelBinding({
    enableFocusStatement: false,
    isActive: options.isCurrentTextProjectionActive,
    handleRedo: options.textEditorHistory.handleRedo,
    handleUndo: options.textEditorHistory.handleUndo,
    getEntry: () => sidebarSnapshot.value.entry,
    getUpdateTarget: () => {
      const lineNumber = sidebarSnapshot.value.lineNumber
      if (lineNumber === undefined) {
        return
      }

      return createTextLineTarget(lineNumber)
    },
    getPreviousSpeaker: () => sidebarSnapshot.value.previousSpeaker,
    onUpdate: handleSidebarUpdate,
  })

  function insertLinesAfterCursor(rawTexts: string[]) {
    const editor = readEditor()
    if (!editor || rawTexts.length === 0) {
      return
    }

    const model = editor.getModel()
    if (!model) {
      return
    }

    const position = editor.getPosition() ?? { lineNumber: model.getLineCount(), column: 1 }
    const lineCount = model.getLineCount()
    const targetLine = editSettings.commandInsertPosition === 'end'
      ? lineCount
      : Math.min(position.lineNumber, lineCount)
    const lineLength = model.getLineMaxColumn(targetLine)

    const currentLineContent = model.getLineContent(targetLine)
    const needsNewline = currentLineContent.length > 0
    const textToInsert = needsNewline ? `\n${rawTexts.join('\n')}` : rawTexts.join('\n')
    const range: monaco.IRange = {
      startLineNumber: targetLine,
      startColumn: lineLength,
      endLineNumber: targetLine,
      endColumn: lineLength,
    }
    options.textEditorHistory.captureBeforeContentChange()

    editor.executeEdits('command-panel', [{
      range,
      text: textToInsert,
      forceMoveMarkers: true,
    }])

    const newLineNumber = targetLine + rawTexts.length - (needsNewline ? 0 : 1)
    editor.setPosition({ lineNumber: newLineNumber, column: 1 })
    editor.revealPositionInCenterIfOutsideViewport({ lineNumber: newLineNumber, column: 1 })
    editor.focus()
  }

  useCommandPanelBridgeBinding({
    isActive: options.isCurrentTextProjectionActive,
    insertCommand(type) {
      insertLinesAfterCursor([commandPanelStore.getInsertText(type)])
    },
    insertGroup(group) {
      insertLinesAfterCursor(group.rawTexts)
    },
  })

  function consumePendingTextTransactionSource(): TransactionSource | undefined {
    const source = pendingTextTransactionSource
    pendingTextTransactionSource = undefined
    return source
  }

  return {
    consumePendingTextTransactionSource,
  }
}
