import {
  createTextEditorStatementLineDropAction,
  resolveTextEditorHitPosition,
} from '~/features/editor/text-editor/text-editor-drop-action'

import type { TextEditorInsertStatementLineDropAction } from './text-editor-drop-action'
import type * as monaco from 'monaco-editor'
import type { CommandPanelStatementDragPayload, DragPosition } from '~/types/drag-drop'

export function resolveTextEditorCommandDropAction(options: {
  editor: monaco.editor.IStandaloneCodeEditor
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
  return createTextEditorStatementLineDropAction({
    hit,
    inlinePlacement: 'after-line',
    insertedStatementText: options.payload.rawTexts.join('\n'),
    lineMaxColumn,
    lineText,
  })
}
