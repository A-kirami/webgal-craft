import { isAnimationFrameEqual } from './transaction-apply'

import type { AnimationDocumentModel, SceneDocumentModel } from './document-model'

export function projectSceneStatements(
  model: SceneDocumentModel,
  previousEntries: StatementEntry[] = [],
): StatementEntry[] {
  const previousEntryMap = new Map(previousEntries.map(entry => [entry.id, entry]))

  return model.statements.map((statement) => {
    const previousEntry = previousEntryMap.get(statement.id)
    if (previousEntry && previousEntry.rawText === statement.rawText) {
      return previousEntry
    }

    return createStatementEntryFromSceneStatement(statement)
  })
}

export function projectAnimationFrames(
  model: AnimationDocumentModel,
  previousFrames: AnimationFrame[] = [],
): AnimationFrame[] {
  return model.frames.map((frame, index) => {
    const previousFrame = previousFrames[index]
    if (previousFrame && isAnimationFrameEqual(previousFrame, frame)) {
      return previousFrame
    }

    return markRaw(structuredClone(frame))
  })
}
