import {
  buildInsertedStatementText,
  resolveEditorDropAsset,
  updateStatementTextForDroppedAsset,
} from '~/features/editor/shared/editor-file-drop'
import { createVisualEditorInsertStatementsDropAction } from '~/features/editor/visual-editor/visual-editor-drop'

import type { AbsPath } from '~/domain/path'
import type { VisualEditorDropAction, VisualEditorDropPlacement } from '~/features/editor/visual-editor/visual-editor-drop'
import type { FileSystemDragPayload } from '~/types/drag-drop'

export function resolveVisualEditorDropAction(options: {
  gamePath: AbsPath
  insertIndex: number
  payload: FileSystemDragPayload
  placement: VisualEditorDropPlacement
  rawText?: string
  statementId?: number
}): VisualEditorDropAction | undefined {
  const asset = resolveEditorDropAsset({
    gamePath: options.gamePath,
    payload: options.payload,
  })
  if (!asset) {
    return undefined
  }

  const insertAction = createVisualEditorInsertStatementsDropAction({
    insertIndex: options.insertIndex,
    rawTexts: [buildInsertedStatementText(asset)],
    placement: options.placement,
  })
  if (insertAction) {
    return insertAction
  }

  if (options.statementId === undefined || options.rawText === undefined) {
    return undefined
  }

  const rawText = updateStatementTextForDroppedAsset(options.rawText, asset)
  if (!rawText) {
    return undefined
  }

  return {
    kind: 'update-statement',
    statementId: options.statementId,
    rawText,
  }
}
