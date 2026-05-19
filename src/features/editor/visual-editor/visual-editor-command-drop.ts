import { createVisualEditorInsertStatementsDropAction } from './visual-editor-drop'

import type { VisualEditorDropPlacement } from './visual-editor-drop'
import type { CommandPanelStatementDragPayload } from '~/types/drag-drop'

export function resolveVisualEditorCommandDropAction(options: {
  insertIndex: number
  payload: CommandPanelStatementDragPayload
  placement: VisualEditorDropPlacement
}) {
  return createVisualEditorInsertStatementsDropAction({
    insertIndex: options.insertIndex,
    placement: options.placement,
    rawTexts: options.payload.rawTexts,
  })
}
