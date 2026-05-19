import * as monaco from 'monaco-editor'

import type { StatementUpdatePayload } from '~/features/editor/statement-editor/useStatementEditor'
import type { DragPosition } from '~/types/drag-drop'

export interface TextEditorInsertTextDropAction {
  kind: 'insert-text'
  range: monaco.IRange
  text: string
}

export interface TextEditorInsertStatementLineDropAction {
  kind: 'insert-statement-line'
  range: monaco.IRange
  text: string
}

export interface TextEditorUpdateStatementDropAction {
  caretRange: monaco.IRange
  kind: 'update-statement'
  payload: StatementUpdatePayload
}

export type TextEditorDropAction =
  | TextEditorInsertTextDropAction
  | TextEditorInsertStatementLineDropAction
  | TextEditorUpdateStatementDropAction

export type TextEditorInlineStatementPlacement = 'after-line' | 'none'

export function resolveTextEditorHitPosition(
  editor: monaco.editor.IStandaloneCodeEditor,
  position: DragPosition,
): monaco.IPosition | undefined {
  return editor.getTargetAtClientPoint(position.x, position.y)?.position ?? undefined
}

export function createTextEditorCollapsedRange(position: monaco.IPosition): monaco.IRange {
  return {
    startLineNumber: position.lineNumber,
    startColumn: position.column,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  }
}

function getFirstNonWhitespaceColumn(lineText: string): number {
  const index = lineText.search(/\S/)
  return index === -1 ? 1 : index + 1
}

function createLineEdgeRange(lineNumber: number, column: number): monaco.IRange {
  return {
    startLineNumber: lineNumber,
    startColumn: column,
    endLineNumber: lineNumber,
    endColumn: column,
  }
}

export function createTextEditorStatementLineDropAction(options: {
  hit: monaco.IPosition
  inlinePlacement?: TextEditorInlineStatementPlacement
  insertedStatementText: string
  lineMaxColumn: number
  lineText: string
}): TextEditorInsertStatementLineDropAction | undefined {
  const {
    hit,
    inlinePlacement = 'none',
    insertedStatementText,
    lineMaxColumn,
    lineText,
  } = options
  if (lineText.trim().length === 0) {
    return {
      kind: 'insert-statement-line',
      text: insertedStatementText,
      range: createLineEdgeRange(hit.lineNumber, 1),
    }
  }

  if (hit.column <= getFirstNonWhitespaceColumn(lineText)) {
    return {
      kind: 'insert-statement-line',
      text: `${insertedStatementText}\n`,
      range: createLineEdgeRange(hit.lineNumber, 1),
    }
  }

  if (inlinePlacement === 'after-line') {
    return {
      kind: 'insert-statement-line',
      text: `\n${insertedStatementText}`,
      range: createLineEdgeRange(hit.lineNumber, lineMaxColumn),
    }
  }
}

export function buildTextEditorDropDecorations(options: {
  action?: TextEditorDropAction
}): monaco.editor.IModelDeltaDecoration[] {
  const { action } = options
  if (!action) {
    return []
  }

  const caretRange = action.kind === 'update-statement' ? action.caretRange : action.range
  return [{
    range: new monaco.Range(
      caretRange.startLineNumber,
      caretRange.startColumn,
      caretRange.endLineNumber,
      caretRange.endColumn,
    ),
    options: {
      className: 'text-editor-drop-caret',
      stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    },
  }]
}
