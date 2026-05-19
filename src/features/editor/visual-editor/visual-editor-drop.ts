export const INSERT_BAND_SIZE_PX = 8

export type VisualEditorDropPlacement = 'head' | 'gap' | 'update' | 'tail'

export type VisualEditorDropAction =
  | { kind: 'insert-statements', insertIndex: number, rawTexts: string[] }
  | { kind: 'update-statement', rawText: string, statementId: number }

type VisualEditorInsertStatementsDropAction = Extract<VisualEditorDropAction, { kind: 'insert-statements' }>

export function isVisualEditorInsertDropPlacement(placement: VisualEditorDropPlacement): boolean {
  return placement === 'head'
    || placement === 'gap'
    || placement === 'tail'
}

export function createVisualEditorInsertStatementsDropAction(options: {
  insertIndex: number
  placement: VisualEditorDropPlacement
  rawTexts: string[]
}): VisualEditorInsertStatementsDropAction | undefined {
  if (!isVisualEditorInsertDropPlacement(options.placement) || options.rawTexts.length === 0) {
    return undefined
  }

  return {
    kind: 'insert-statements',
    insertIndex: options.insertIndex,
    rawTexts: [...options.rawTexts],
  }
}
