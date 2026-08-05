import { parseSentence } from '~/domain/script/parser'
import {
  buildInsertedStatementText,
  resolveEditorDropAsset,
  updateStatementTextForDroppedAsset,
} from '~/features/editor/shared/editor-file-drop'
import { createTextLineTarget } from '~/features/editor/statement-editor/useStatementEditor'
import {
  createTextEditorCollapsedRange,
  createTextEditorStatementLineDropAction,
  resolveTextEditorHitPosition,
  resolveTextEditorStatementRange,
} from '~/features/editor/text-editor/text-editor-drop-action'

import type * as monaco from 'monaco-editor'
import type { AbsPath } from '~/domain/path'
import type { StatementSyntaxCapabilities } from '~/domain/script/sentence'
import type { TextEditorDropAction } from '~/features/editor/text-editor/text-editor-drop-action'
import type { DragPosition, FileSystemDragPayload } from '~/types/drag-drop'

function isWebgalCommentColumn(lineText: string, column: number): boolean {
  for (let index = 0; index < lineText.length; index++) {
    if (lineText[index] === ';' && lineText[index - 1] !== '\\') {
      return column > index + 1
    }
  }

  return false
}

function getFirstNonWhitespaceColumn(lineText: string): number {
  const index = lineText.search(/\S/)
  return index === -1 ? 1 : index + 1
}

export function resolveTextEditorFileDropAction(options: {
  editor: monaco.editor.IStandaloneCodeEditor
  capabilities?: StatementSyntaxCapabilities
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
  const hit = resolveTextEditorHitPosition(options.editor, options.position)
  if (!model || !hit) {
    return undefined
  }

  const lineText = model.getLineContent(hit.lineNumber)
  const lineMaxColumn = model.getLineMaxColumn(hit.lineNumber)
  const range = resolveTextEditorStatementRange(model, hit.lineNumber, options.capabilities)
  const isMultilineRange = range !== undefined && range.startLine !== range.endLine
  const isAtStatementLeadingBoundary = isMultilineRange
    && hit.lineNumber - 1 === range.startLine
    && hit.column <= getFirstNonWhitespaceColumn(lineText)
  if (isMultilineRange && !isAtStatementLeadingBoundary) {
    const nextRawText = updateStatementTextForDroppedAsset(range.rawText, asset)
    const parsed = nextRawText ? parseSentence(nextRawText) : undefined
    if (nextRawText && parsed) {
      return {
        caretRange: createTextEditorCollapsedRange(hit),
        kind: 'update-statement',
        payload: {
          target: createTextLineTarget(range.startLine + 1, range.endLine + 1),
          rawText: nextRawText,
          parsed,
        },
        selectionLineNumber: range.startLine + 1,
      }
    }

    const endLineNumber = range.endLine + 1
    return createTextEditorStatementLineDropAction({
      hit: { lineNumber: endLineNumber, column: model.getLineMaxColumn(endLineNumber) },
      inlinePlacement: 'after-line',
      insertedStatementText: buildInsertedStatementText(asset),
      lineMaxColumn: model.getLineMaxColumn(endLineNumber),
      lineText: model.getLineContent(endLineNumber),
    })
  }

  const statementLineAction = createTextEditorStatementLineDropAction({
    hit,
    inlinePlacement: isWebgalCommentColumn(lineText, hit.column) && hit.column >= lineMaxColumn
      ? 'after-line'
      : 'none',
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
        caretRange: createTextEditorCollapsedRange(hit),
        kind: 'update-statement',
        payload: {
          target: createTextLineTarget(hit.lineNumber),
          rawText: nextRawText,
          parsed,
        },
        selectionLineNumber: hit.lineNumber,
      }
    }
  }

  return {
    kind: 'insert-text',
    text: asset.scriptPath,
    range: createTextEditorCollapsedRange(hit),
    selectionLineNumber: hit.lineNumber,
  }
}
