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
} from '~/features/editor/text-editor/text-editor-drop-action'

import type * as monaco from 'monaco-editor'
import type { AbsPath } from '~/domain/path'
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
  const hit = resolveTextEditorHitPosition(options.editor, options.position)
  if (!model || !hit) {
    return undefined
  }

  const lineText = model.getLineContent(hit.lineNumber)
  const lineMaxColumn = model.getLineMaxColumn(hit.lineNumber)
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
