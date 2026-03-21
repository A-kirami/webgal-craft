import {
  getTextOffsetFromPosition,
  getTextPositionFromOffset,
} from '~/models/text-projection'

import type * as monaco from 'monaco-editor'
import type { EditorHistorySnapshot } from '~/models/transaction'

export interface OffsetSelectionSnapshot {
  selectionStartOffset: number
  positionOffset: number
}

export interface TextEditorCursorSnapshot {
  selections: monaco.Selection[]
  offsetSelections: OffsetSelectionSnapshot[]
  scrollTop: number
  scrollLeft: number
}

export function computeHistoryCursorOffset(beforeContent: string, afterContent: string): number {
  if (beforeContent === afterContent) {
    return afterContent.length
  }

  const maxPrefixLength = Math.min(beforeContent.length, afterContent.length)
  let prefixLength = 0
  while (prefixLength < maxPrefixLength
    && beforeContent[prefixLength] === afterContent[prefixLength]) {
    prefixLength++
  }

  let beforeSuffixStart = beforeContent.length
  let afterSuffixStart = afterContent.length
  while (beforeSuffixStart > prefixLength
    && afterSuffixStart > prefixLength
    && beforeContent[beforeSuffixStart - 1] === afterContent[afterSuffixStart - 1]) {
    beforeSuffixStart--
    afterSuffixStart--
  }

  return afterSuffixStart
}

export function createEditorSelection(
  selectionStartLineNumber: number,
  selectionStartColumn: number,
  positionLineNumber: number,
  positionColumn: number,
  range: monaco.IRange = normalizeSelectionRange(
    selectionStartLineNumber,
    selectionStartColumn,
    positionLineNumber,
    positionColumn,
  ),
): monaco.Selection {
  return {
    selectionStartLineNumber,
    selectionStartColumn,
    positionLineNumber,
    positionColumn,
    startLineNumber: range.startLineNumber,
    startColumn: range.startColumn,
    endLineNumber: range.endLineNumber,
    endColumn: range.endColumn,
    getPosition() {
      return {
        lineNumber: positionLineNumber,
        column: positionColumn,
      }
    },
  } as monaco.Selection
}

function normalizeSelectionRange(
  selectionStartLineNumber: number,
  selectionStartColumn: number,
  positionLineNumber: number,
  positionColumn: number,
): monaco.IRange {
  const isSelectionStartBeforePosition = selectionStartLineNumber < positionLineNumber
    || (selectionStartLineNumber === positionLineNumber && selectionStartColumn <= positionColumn)

  if (isSelectionStartBeforePosition) {
    return {
      startLineNumber: selectionStartLineNumber,
      startColumn: selectionStartColumn,
      endLineNumber: positionLineNumber,
      endColumn: positionColumn,
    }
  }

  return {
    startLineNumber: positionLineNumber,
    startColumn: positionColumn,
    endLineNumber: selectionStartLineNumber,
    endColumn: selectionStartColumn,
  }
}

export function cloneEditorSelection(selection: monaco.Selection): monaco.Selection {
  return createEditorSelection(
    selection.selectionStartLineNumber,
    selection.selectionStartColumn,
    selection.positionLineNumber,
    selection.positionColumn,
  )
}

export function captureCursorSnapshotFromEditor(
  editor: monaco.editor.IStandaloneCodeEditor,
): TextEditorCursorSnapshot | undefined {
  const model = editor.getModel()
  if (!model) {
    return
  }

  const selections = editor.getSelections()
  if (!selections || selections.length === 0) {
    return
  }

  return {
    selections: selections.map(selection => cloneEditorSelection(selection)),
    offsetSelections: selections.map(selection => ({
      selectionStartOffset: model.getOffsetAt({
        lineNumber: selection.selectionStartLineNumber,
        column: selection.selectionStartColumn,
      }),
      positionOffset: model.getOffsetAt({
        lineNumber: selection.positionLineNumber,
        column: selection.positionColumn,
      }),
    })),
    scrollTop: editor.getScrollTop(),
    scrollLeft: editor.getScrollLeft(),
  }
}

export function captureEditorHistorySnapshot(
  snapshot: TextEditorCursorSnapshot,
): EditorHistorySnapshot {
  return {
    selections: snapshot.offsetSelections.map(selection => ({
      selectionStartOffset: selection.selectionStartOffset,
      positionOffset: selection.positionOffset,
    })),
    scrollTop: snapshot.scrollTop,
    scrollLeft: snapshot.scrollLeft,
  }
}

export function buildBeforeHistorySnapshotFromChangeEvent(
  event: monaco.editor.IModelContentChangedEvent,
  previousContent: string,
  editor: monaco.editor.IStandaloneCodeEditor | undefined,
  fallbackSnapshot?: TextEditorCursorSnapshot,
): EditorHistorySnapshot | undefined {
  if (fallbackSnapshot) {
    return captureEditorHistorySnapshot(fallbackSnapshot)
  }

  if (event.changes.length === 0) {
    return
  }

  const hasNonCollapsedRange = event.changes.some(change =>
    change.range.startLineNumber !== change.range.endLineNumber
    || change.range.startColumn !== change.range.endColumn,
  )

  if (!hasNonCollapsedRange) {
    return
  }

  return {
    selections: event.changes.map(change => ({
      selectionStartOffset: getTextOffsetFromPosition(
        previousContent,
        change.range.startLineNumber,
        change.range.startColumn,
      ),
      positionOffset: getTextOffsetFromPosition(
        previousContent,
        change.range.endLineNumber,
        change.range.endColumn,
      ),
    })),
    scrollTop: editor?.getScrollTop() ?? 0,
    scrollLeft: editor?.getScrollLeft() ?? 0,
  }
}

export function restoreEditorCursorSnapshot(
  editor: monaco.editor.IStandaloneCodeEditor,
  snapshot: TextEditorCursorSnapshot,
): number | undefined {
  const model = editor.getModel()
  if (!model) {
    return
  }

  const selections = snapshot.selections.map((selection) => {
    const validatedRange = model.validateRange(selection)
    const validatedSelectionStart = model.validatePosition({
      lineNumber: selection.selectionStartLineNumber,
      column: selection.selectionStartColumn,
    })
    const validatedPosition = model.validatePosition({
      lineNumber: selection.positionLineNumber,
      column: selection.positionColumn,
    })

    return createEditorSelection(
      validatedSelectionStart.lineNumber,
      validatedSelectionStart.column,
      validatedPosition.lineNumber,
      validatedPosition.column,
      validatedRange,
    )
  })

  if (selections.length === 0) {
    return
  }

  editor.setSelections(selections)
  editor.setScrollTop(snapshot.scrollTop)
  editor.setScrollLeft(snapshot.scrollLeft)

  return selections[0].positionLineNumber
}

export function restoreEditorHistorySnapshot(
  editor: monaco.editor.IStandaloneCodeEditor,
  snapshot: EditorHistorySnapshot,
): number | undefined {
  const model = editor.getModel()
  if (!model || snapshot.selections.length === 0) {
    return
  }

  const selections = snapshot.selections.map((selection) => {
    const selectionStart = getTextPositionFromOffset(model.getValue(), selection.selectionStartOffset)
    const position = getTextPositionFromOffset(model.getValue(), selection.positionOffset)
    return createEditorSelection(
      selectionStart.lineNumber,
      selectionStart.column,
      position.lineNumber,
      position.column,
    )
  })

  editor.setSelections(selections)
  editor.setScrollTop(snapshot.scrollTop)
  editor.setScrollLeft(snapshot.scrollLeft)
  editor.revealPositionInCenterIfOutsideViewport(selections[0].getPosition())

  return selections[0].positionLineNumber
}

export function restoreEditorCursorOffset(
  editor: monaco.editor.IStandaloneCodeEditor,
  offset: number,
  snapshot?: TextEditorCursorSnapshot,
): number | undefined {
  const model = editor.getModel()
  if (!model) {
    return
  }

  const primaryPosition = getTextPositionFromOffset(
    model.getValue(),
    Math.min(Math.max(offset, 0), model.getValueLength()),
  )

  const offsetSelections = snapshot?.offsetSelections
  const currentPrimaryOffset = offsetSelections?.[0]?.positionOffset
  const selections = currentPrimaryOffset === undefined || !offsetSelections
    ? [createEditorSelection(
        primaryPosition.lineNumber,
        primaryPosition.column,
        primaryPosition.lineNumber,
        primaryPosition.column,
      )]
    : offsetSelections.map((selection) => {
        const selectionStart = getTextPositionFromOffset(
          model.getValue(),
          Math.min(Math.max(selection.selectionStartOffset + (offset - currentPrimaryOffset), 0), model.getValueLength()),
        )
        const position = getTextPositionFromOffset(
          model.getValue(),
          Math.min(Math.max(selection.positionOffset + (offset - currentPrimaryOffset), 0), model.getValueLength()),
        )

        return createEditorSelection(
          selectionStart.lineNumber,
          selectionStart.column,
          position.lineNumber,
          position.column,
        )
      })

  editor.setSelections(selections)
  if (snapshot) {
    editor.setScrollTop(snapshot.scrollTop)
    editor.setScrollLeft(snapshot.scrollLeft)
  }
  editor.revealPositionInCenterIfOutsideViewport(primaryPosition)

  return primaryPosition.lineNumber
}
