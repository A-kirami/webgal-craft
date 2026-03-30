import type * as monaco from 'monaco-editor'

interface LineRangeSelectionLike {
  endLineNumber: number
  startLineNumber: number
}

interface MultipleTargetSelectionLike {
  secondarySelections?: readonly LineRangeSelectionLike[]
  selection?: LineRangeSelectionLike | null
}

interface SelectionChangeLike extends MultipleTargetSelectionLike {
  oldSelections?: readonly LineRangeSelectionLike[] | null
}

function hasCrossLineSelection(selection?: LineRangeSelectionLike | null): boolean {
  if (!selection) {
    return false
  }

  return selection.startLineNumber !== selection.endLineNumber
}

function hasMultipleSelections(selections?: readonly LineRangeSelectionLike[] | null): boolean {
  if (!selections || selections.length === 0) {
    return false
  }

  return selections.length > 1
    || hasCrossLineSelection(selections[0])
}

export function hasMultipleEditTargets(selectionLike?: MultipleTargetSelectionLike | null): boolean {
  if (!selectionLike) {
    return false
  }

  return hasCrossLineSelection(selectionLike.selection)
    || (selectionLike.secondarySelections?.length ?? 0) > 0
}

export function didResumeSingleEditTarget(selectionLike?: SelectionChangeLike | null): boolean {
  if (!selectionLike) {
    return false
  }

  return hasMultipleSelections(selectionLike.oldSelections)
    && !hasMultipleEditTargets(selectionLike)
}

export function readEditorHasMultipleEditTargets(
  editor?: Pick<monaco.editor.IStandaloneCodeEditor, 'getSelections'>,
): boolean {
  return hasMultipleSelections(editor?.getSelections())
}
