import { useCommandPanelBridgeBinding, useSidebarPanelBinding } from '~/features/editor/shared/useEditorPanelBindings'
import { createEmptySceneTextPanelSnapshot, resolveSceneTextPanelSnapshotFromContent } from '~/features/editor/text-editor/scene-text-panel'
import { hasMultipleEditTargets } from '~/features/editor/text-editor/text-editor-selection'
import { useTextEditorHistory } from '~/features/editor/text-editor/useTextEditorHistory'
import { useCommandPanelStore } from '~/stores/command-panel'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { useEditorStore } from '~/stores/editor'

import { createTextLineTarget } from '../statement-editor/useStatementEditor'

import type { StatementUpdatePayload } from '../statement-editor/useStatementEditor'
import type * as monaco from 'monaco-editor'
import type { TransactionSource } from '~/domain/document/transaction'
import type { TextProjectionState } from '~/stores/editor'

interface TextEditorSidebarPanelBindings {
  handleFormUpdate: (payload: StatementUpdatePayload) => boolean
}

type TextEditorHistoryCoordinator = ReturnType<typeof useTextEditorHistory>

interface ProgrammaticTextEdit {
  range: monaco.IRange
  text: string
}

type MonacoEditSource = 'command-panel' | 'file-drop'

interface UseTextEditorBindingsOptions {
  editorRef: ShallowRef<monaco.editor.IStandaloneCodeEditor | undefined>
  getState: () => TextProjectionState
  isCurrentTextProjectionActive: () => boolean
  formPanel: TextEditorSidebarPanelBindings
  textEditorHistory: TextEditorHistoryCoordinator
}

function resolveInsertedTextEndPosition(range: monaco.IRange, text: string): monaco.IPosition {
  const segments = text.split('\n')
  if (segments.length === 1) {
    return {
      lineNumber: range.startLineNumber,
      column: range.startColumn + text.length,
    }
  }

  const lastSegment = segments.at(-1) ?? ''
  return {
    lineNumber: range.startLineNumber + segments.length - 1,
    column: lastSegment.length + 1,
  }
}

export function useTextEditorBindings(options: UseTextEditorBindingsOptions) {
  const editorStore = useEditorStore()
  const editSettings = useEditSettingsStore()
  const commandPanelStore = useCommandPanelStore()
  const state = computed(() => options.getState())

  let pendingTextTransactionSource: TransactionSource | undefined
  let isSingleStatementEditingSuspended = $ref(false)

  function readEditor(): monaco.editor.IStandaloneCodeEditor | undefined {
    return options.editorRef.value
  }

  function applyEditorEdit(
    editor: monaco.editor.IStandaloneCodeEditor,
    edit: ProgrammaticTextEdit,
    editSource: MonacoEditSource,
  ) {
    options.textEditorHistory.captureBeforeContentChange()
    editor.executeEdits(editSource, [{
      range: edit.range,
      text: edit.text,
      forceMoveMarkers: true,
    }])

    const endPosition = resolveInsertedTextEndPosition(edit.range, edit.text)
    editor.setPosition(endPosition)
    editor.revealPositionInCenterIfOutsideViewport(endPosition)
    editor.focus()
  }

  const sidebarSnapshot = computed(() => {
    const currentState = state.value
    if (currentState.kind !== 'scene' || isSingleStatementEditingSuspended) {
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
    getEmptyState: () => isSingleStatementEditingSuspended ? 'multiple-edit-targets' : undefined,
    getUpdateTarget: () => {
      const { lineNumber } = sidebarSnapshot.value
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
    applyEditorEdit(editor, {
      range,
      text: textToInsert,
    }, 'command-panel')
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

  function applyProgrammaticInsert(
    edit: ProgrammaticTextEdit,
    source: TransactionSource = 'external',
  ): boolean {
    const editor = readEditor()
    if (!editor) {
      return false
    }

    const model = editor.getModel()
    if (!model) {
      return false
    }

    if (model.getValueInRange(edit.range) === edit.text) {
      return false
    }

    pendingTextTransactionSource = source
    applyEditorEdit(editor, edit, 'file-drop')
    return true
  }

  function applyProgrammaticStatementUpdate(
    payload: StatementUpdatePayload,
    source: TransactionSource = 'external',
  ): boolean {
    pendingTextTransactionSource = source
    if (!options.formPanel.handleFormUpdate(payload)) {
      pendingTextTransactionSource = undefined
      return false
    }

    return true
  }

  function handleCursorSelectionChange(event: monaco.editor.ICursorSelectionChangedEvent): void {
    isSingleStatementEditingSuspended = hasMultipleEditTargets(event)
  }

  return {
    applyProgrammaticInsert,
    applyProgrammaticStatementUpdate,
    consumePendingTextTransactionSource,
    handleCursorSelectionChange,
  }
}
