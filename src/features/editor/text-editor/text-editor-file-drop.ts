import * as monaco from 'monaco-editor'

import { parseSentence } from '~/domain/script/parser'
import {
  buildInsertedStatementText,
  resolveEditorDropAsset,
  updateStatementTextForDroppedAsset,
} from '~/features/editor/shared/editor-file-drop'
import { createTextLineTarget } from '~/features/editor/statement-editor/useStatementEditor'

import type { AbsPath } from '~/domain/path'
import type { StatementUpdatePayload } from '~/features/editor/statement-editor/useStatementEditor'
import type { DragPosition, FileSystemDragPayload } from '~/types/drag-drop'

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

function resolveHitPosition(
  editor: monaco.editor.IStandaloneCodeEditor,
  position: DragPosition,
): monaco.IPosition | undefined {
  const target = editor.getTargetAtClientPoint(position.x, position.y)
  if (!target?.position) {
    return undefined
  }

  return target.position
}

function getFirstNonWhitespaceColumn(lineText: string): number {
  const index = lineText.search(/\S/)
  return index === -1 ? 1 : index + 1
}

function isWebgalCommentColumn(lineText: string, column: number): boolean {
  for (let index = 0; index < lineText.length; index++) {
    if (lineText[index] === ';' && lineText[index - 1] !== '\\') {
      return column > index + 1
    }
  }

  return false
}

function createCollapsedRange(position: monaco.IPosition): monaco.IRange {
  return {
    startLineNumber: position.lineNumber,
    startColumn: position.column,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  }
}

function createStatementLineDropAction(options: {
  hit: monaco.IPosition
  insertedStatementText: string
  lineMaxColumn: number
  lineText: string
}): TextEditorInsertStatementLineDropAction | undefined {
  const { hit, insertedStatementText, lineMaxColumn, lineText } = options
  if (lineText.trim().length === 0) {
    return {
      kind: 'insert-statement-line',
      text: insertedStatementText,
      range: {
        startLineNumber: hit.lineNumber,
        startColumn: 1,
        endLineNumber: hit.lineNumber,
        endColumn: 1,
      },
    }
  }

  if (hit.column <= getFirstNonWhitespaceColumn(lineText)) {
    return {
      kind: 'insert-statement-line',
      text: `${insertedStatementText}\n`,
      range: {
        startLineNumber: hit.lineNumber,
        startColumn: 1,
        endLineNumber: hit.lineNumber,
        endColumn: 1,
      },
    }
  }

  if (isWebgalCommentColumn(lineText, hit.column) && hit.column >= lineMaxColumn) {
    return {
      kind: 'insert-statement-line',
      text: `\n${insertedStatementText}`,
      range: {
        startLineNumber: hit.lineNumber,
        startColumn: lineMaxColumn,
        endLineNumber: hit.lineNumber,
        endColumn: lineMaxColumn,
      },
    }
  }
}

export function resolveTextEditorFileDropAction(options: {
  editor: monaco.editor.IStandaloneCodeEditor
  gamePath: AbsPath
  payload: FileSystemDragPayload
  position: DragPosition
}): TextEditorDropAction | undefined {
  const asset = resolveEditorDropAsset({
    gamePath: options.gamePath,
    payload: options.payload,
  })
  if (!asset) {
    return undefined
  }

  const model = options.editor.getModel()
  const hit = resolveHitPosition(options.editor, options.position)
  if (!model || !hit) {
    return undefined
  }

  const lineText = model.getLineContent(hit.lineNumber)
  const lineMaxColumn = model.getLineMaxColumn(hit.lineNumber)
  const statementLineAction = createStatementLineDropAction({
    hit,
    insertedStatementText: buildInsertedStatementText(asset),
    lineMaxColumn,
    lineText,
  })
  if (statementLineAction) {
    return statementLineAction
  }

  if (!isWebgalCommentColumn(lineText, hit.column)) {
    const nextRawText = updateStatementTextForDroppedAsset(lineText, asset)
    const parsed = nextRawText ? parseSentence(nextRawText) : undefined
    if (nextRawText && parsed) {
      return {
        caretRange: createCollapsedRange(hit),
        kind: 'update-statement',
        payload: {
          target: createTextLineTarget(hit.lineNumber),
          rawText: nextRawText,
          parsed,
        },
      }
    }
  }

  return {
    kind: 'insert-text',
    text: asset.scriptPath,
    range: {
      startLineNumber: hit.lineNumber,
      startColumn: hit.column,
      endLineNumber: hit.lineNumber,
      endColumn: hit.column,
    },
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
  const decorations: monaco.editor.IModelDeltaDecoration[] = [{
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

  return decorations
}
