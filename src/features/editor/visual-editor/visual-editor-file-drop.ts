import {
  buildInsertedStatementText,
  resolveEditorDropAsset,
  updateStatementTextForDroppedAsset,
} from '~/features/editor/shared/editor-file-drop'

import type { AbsPath } from '~/domain/path'
import type { FileSystemDragPayload } from '~/types/drag-drop'

export const INSERT_BAND_SIZE_PX = 8

export type VisualEditorDropPlacement = 'head' | 'gap' | 'update' | 'tail'

export type VisualEditorDropAction =
  | { kind: 'insert-statements', insertIndex: number, rawTexts: string[] }
  | { kind: 'update-statement', rawText: string, statementId: number }

function isInsertPlacement(placement: VisualEditorDropPlacement): boolean {
  return placement === 'head'
    || placement === 'gap'
    || placement === 'tail'
}

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

  if (isInsertPlacement(options.placement)) {
    return {
      kind: 'insert-statements',
      insertIndex: options.insertIndex,
      rawTexts: [buildInsertedStatementText(asset)],
    }
  }

  if (options.statementId === undefined || !options.rawText) {
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
