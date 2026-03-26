import { getPreviousSpeakerAtIndex } from '~/utils/speaker'

interface SceneSelectableStatement {
  id: number
  rawText: string
}

export interface SceneSelectionSnapshot {
  selectedStatementId: number | undefined
  lastEditedStatementId: number | undefined
  lastLineNumber: number | undefined
}

export interface SceneSelectionState {
  selectedStatementId?: number
  lastEditedStatementId?: number
  lastLineNumber?: number
}

export interface ResolvedSceneSelectionState {
  statements: readonly SceneSelectableStatement[]
  index: number
  selectedStatementId?: number
}

export function createSceneSelectionSnapshot(
  selectedStatementId: number | undefined,
  options: {
    lastEditedStatementId?: number | undefined
    lastLineNumber?: number | undefined
  } = {},
): SceneSelectionSnapshot {
  return {
    selectedStatementId,
    lastEditedStatementId: options.lastEditedStatementId,
    lastLineNumber: options.lastLineNumber,
  }
}

export function captureSceneSelectionSnapshot(selection?: SceneSelectionState): SceneSelectionSnapshot {
  return createSceneSelectionSnapshot(selection?.selectedStatementId, {
    lastEditedStatementId: selection?.lastEditedStatementId,
    lastLineNumber: selection?.lastLineNumber,
  })
}

export function computeLineNumberFromStatementId(
  statements: readonly SceneSelectableStatement[],
  statementId: number,
): number | undefined {
  let currentLine = 1
  for (const entry of statements) {
    if (entry.id === statementId) {
      return currentLine
    }
    currentLine += countStatementLines(entry.rawText)
  }
  return undefined
}

export function computeStatementIdFromLineNumber(
  statements: readonly SceneSelectableStatement[],
  lineNumber: number,
): number | undefined {
  if (lineNumber < 1) {
    return undefined
  }

  let currentLine = 1
  for (const entry of statements) {
    const lineCount = countStatementLines(entry.rawText)
    if (lineNumber < currentLine + lineCount) {
      return entry.id
    }
    currentLine += lineCount
  }

  return statements.at(-1)?.id
}

export function resolveSceneSelectionState(
  statements: readonly SceneSelectableStatement[],
  selection?: SceneSelectionState,
): ResolvedSceneSelectionState | undefined {
  if (statements.length === 0) {
    return undefined
  }

  let selectedStatementId = selection?.selectedStatementId
  let index = selectedStatementId === undefined
    ? -1
    : statements.findIndex(statement => statement.id === selectedStatementId)

  if (index === -1 && selection?.lastLineNumber !== undefined) {
    selectedStatementId = computeStatementIdFromLineNumber(statements, selection.lastLineNumber)
    index = selectedStatementId === undefined
      ? -1
      : statements.findIndex(statement => statement.id === selectedStatementId)
  }

  if (index === -1) {
    index = 0
    selectedStatementId = statements[0]?.id
  }

  return {
    statements,
    index,
    selectedStatementId,
  }
}

export function reconcileSceneSelectionState(
  statements: readonly SceneSelectableStatement[],
  selection?: SceneSelectionState,
): Partial<SceneSelectionState> | undefined {
  if (!selection) {
    return undefined
  }

  const resolvedSelection = resolveSceneSelectionState(statements, selection)
  if (!resolvedSelection) {
    return undefined
  }

  const patch: Partial<SceneSelectionState> = {}
  if (selection.selectedStatementId !== resolvedSelection.selectedStatementId) {
    patch.selectedStatementId = resolvedSelection.selectedStatementId
  }

  if (selection.lastEditedStatementId !== undefined) {
    const lastEditedExists = resolvedSelection.statements.some(
      statement => statement.id === selection.lastEditedStatementId,
    )
    if (!lastEditedExists) {
      patch.lastEditedStatementId = resolvedSelection.selectedStatementId
    }
  }

  return Object.keys(patch).length > 0 ? patch : undefined
}

export function getSelectedSceneStatement(
  statements: readonly SceneSelectableStatement[],
  selection?: SceneSelectionState,
): SceneSelectableStatement | undefined {
  const resolvedSelection = resolveSceneSelectionState(statements, selection)
  if (!resolvedSelection) {
    return undefined
  }

  return resolvedSelection.statements[resolvedSelection.index]
}

export function getSelectedSceneStatementPreviousSpeaker(
  statements: readonly SceneSelectableStatement[],
  selection?: SceneSelectionState,
): string {
  const resolvedSelection = resolveSceneSelectionState(statements, selection)
  if (!resolvedSelection || resolvedSelection.index <= 0) {
    return ''
  }

  return getPreviousSpeakerAtIndex(resolvedSelection.statements, resolvedSelection.index)
}

function countStatementLines(rawText: string): number {
  let lineCount = 1
  let pos = 0
  while ((pos = rawText.indexOf('\n', pos)) !== -1) {
    lineCount++
    pos++
  }
  return lineCount
}
