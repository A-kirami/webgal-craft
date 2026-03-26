import type * as monaco from 'monaco-editor'

export function normalizeEditorViewState(
  viewState: monaco.editor.ICodeEditorViewState | null,
  selections: readonly monaco.Selection[] | null | undefined,
): monaco.editor.ICodeEditorViewState | null {
  if (!viewState || !selections || selections.length === 0) {
    return viewState
  }

  return {
    ...viewState,
    cursorState: selections.map(selection => ({
      inSelectionMode:
        selection.selectionStartLineNumber !== selection.positionLineNumber
        || selection.selectionStartColumn !== selection.positionColumn,
      selectionStart: {
        lineNumber: selection.selectionStartLineNumber,
        column: selection.selectionStartColumn,
      },
      position: {
        lineNumber: selection.positionLineNumber,
        column: selection.positionColumn,
      },
    })),
  }
}
