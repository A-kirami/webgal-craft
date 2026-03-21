export interface ScenePresentationState {
  collapsedStatementIds: Partial<Record<number, true>>
}

export function createScenePresentationState(): ScenePresentationState {
  return {
    collapsedStatementIds: {},
  }
}

export function isSceneStatementCollapsed(
  presentation: ScenePresentationState | undefined,
  statementId: number,
): boolean {
  return presentation?.collapsedStatementIds[statementId] === true
}

export function setSceneStatementCollapsed(
  presentation: ScenePresentationState,
  statementId: number,
  collapsed: boolean,
): boolean {
  const wasCollapsed = isSceneStatementCollapsed(presentation, statementId)
  if (wasCollapsed === collapsed) {
    return false
  }

  if (collapsed) {
    presentation.collapsedStatementIds[statementId] = true
    return true
  }

  delete presentation.collapsedStatementIds[statementId]
  return true
}

export function reconcileScenePresentationState(
  statements: readonly Pick<StatementEntry, 'id'>[],
  presentation: ScenePresentationState | undefined,
): boolean {
  if (!presentation) {
    return false
  }

  const validStatementIds = new Set(statements.map(statement => statement.id))
  let changed = false

  for (const rawStatementId of Object.keys(presentation.collapsedStatementIds)) {
    const statementId = Number(rawStatementId)
    if (validStatementIds.has(statementId)) {
      continue
    }

    delete presentation.collapsedStatementIds[statementId]
    changed = true
  }

  return changed
}
