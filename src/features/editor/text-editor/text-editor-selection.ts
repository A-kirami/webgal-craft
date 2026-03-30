import type * as monaco from 'monaco-editor'

interface LineRangeSelectionLike {
  endLineNumber: number
  startLineNumber: number
}

interface MultipleTargetSelectionLike {
  secondarySelections?: readonly LineRangeSelectionLike[]
  selection?: LineRangeSelectionLike | null
}

function hasCrossLineSelection(selection?: LineRangeSelectionLike | null): boolean {
  if (!selection) {
    return false
  }

  return selection.startLineNumber !== selection.endLineNumber
}

export function hasMultipleEditTargets(selectionLike?: MultipleTargetSelectionLike | null): boolean {
  if (!selectionLike) {
    return false
  }

  return hasCrossLineSelection(selectionLike.selection)
    || (selectionLike.secondarySelections?.length ?? 0) > 0
}

export function readEditorHasMultipleEditTargets(
  editor?: Pick<monaco.editor.IStandaloneCodeEditor, 'getSelections'>,
): boolean {
  const selections = editor?.getSelections()
  if (!selections || selections.length === 0) {
    return false
  }

  return selections.length > 1
    || hasCrossLineSelection(selections[0])
}
