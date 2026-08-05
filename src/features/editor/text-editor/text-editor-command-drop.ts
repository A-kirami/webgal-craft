import {
  createTextEditorStatementLineDropAction,
  resolveTextEditorHitPosition,
  resolveTextEditorStatementRange,
} from '~/features/editor/text-editor/text-editor-drop-action'

import type { TextEditorInsertStatementLineDropAction } from './text-editor-drop-action'
import type * as monaco from 'monaco-editor'
import type { StatementSyntaxCapabilities } from '~/domain/script/sentence'
import type { CommandPanelStatementDragPayload, DragPosition } from '~/types/drag-drop'

export function resolveTextEditorCommandDropAction(options: {
  editor: monaco.editor.IStandaloneCodeEditor
  capabilities?: StatementSyntaxCapabilities
  payload: CommandPanelStatementDragPayload
  position: DragPosition
}): TextEditorInsertStatementLineDropAction | undefined {
  if (options.payload.rawTexts.length === 0) {
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
  if (range && range.startLine !== range.endLine && hit.lineNumber - 1 > range.startLine) {
    const endLineNumber = range.endLine + 1
    const endLineText = model.getLineContent(endLineNumber)
    return createTextEditorStatementLineDropAction({
      hit: { lineNumber: endLineNumber, column: model.getLineMaxColumn(endLineNumber) },
      inlinePlacement: 'after-line',
      insertedStatementText: options.payload.rawTexts.join('\n'),
      lineMaxColumn: model.getLineMaxColumn(endLineNumber),
      lineText: endLineText,
    })
  }

  return createTextEditorStatementLineDropAction({
    hit,
    inlinePlacement: 'after-line',
    insertedStatementText: options.payload.rawTexts.join('\n'),
    lineMaxColumn,
    lineText,
  })
}
