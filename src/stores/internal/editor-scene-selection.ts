import {
  computeLineNumberFromStatementId,
  computeStatementIdFromLineNumber,
  getSelectedSceneStatement as getSelectedSceneStatementForSelection,
  getSelectedSceneStatementPreviousSpeaker as getSelectedSceneStatementPreviousSpeakerForSelection,
  reconcileSceneSelectionState,
  resolveSceneSelectionState,
} from '~/domain/document/scene-selection'
import {
  isSceneStatementCollapsed as isSceneStatementCollapsedForPresentation,
  reconcileScenePresentationState,
  setSceneStatementCollapsed as setSceneStatementCollapsedForPresentation,
} from '~/features/editor/shared/scene-presentation'

import type { DocumentStateOfKind } from './editor-document-state'
import type { EditableEditorSession } from './editor-session'
import type { SceneStatement } from '~/domain/document/document-model'
import type { SceneSelectionState } from '~/domain/document/scene-selection'
import type { ScenePresentationState } from '~/features/editor/shared/scene-presentation'

// ============================================================
// 场景选择与展示状态管理
// ============================================================

export interface EditableSceneSession extends EditableEditorSession {
  document: DocumentStateOfKind<'scene'>
  scenePresentation: ScenePresentationState
  sceneSelection: SceneSelectionState
}

export function createSceneSelectionActions(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
) {
  return {
    getScenePresentationState(path: string): ScenePresentationState | undefined {
      return getScenePresentationState(getEditableSession, path)
    },
    getSceneSelection(path: string): SceneSelectionState | undefined {
      return getSceneSelection(getEditableSession, path)
    },
    getSceneSelectionIndex(path: string): number | undefined {
      return getSceneSelectionIndex(getEditableSession, path)
    },
    getSelectedSceneStatement(path: string): SceneStatement | undefined {
      return getSelectedSceneStatement(getEditableSession, path)
    },
    getSelectedSceneStatementPreviousSpeaker(path: string): string {
      return getSelectedSceneStatementPreviousSpeaker(getEditableSession, path)
    },
    isSceneStatementCollapsed(path: string, statementId: number): boolean {
      return isSceneStatementCollapsed(getEditableSession, path, statementId)
    },
    patchSceneSelection(path: string, patch: Partial<SceneSelectionState>): void {
      patchSceneSelection(getEditableSession, path, patch)
    },
    reconcileScenePresentation(path: string): void {
      reconcileScenePresentation(getEditableSession, path)
    },
    reconcileSceneSelection(path: string): void {
      reconcileSceneSelection(getEditableSession, path)
    },
    setSceneStatementCollapsed(path: string, statementId: number, collapsed: boolean): void {
      setSceneStatementCollapsed(getEditableSession, path, statementId, collapsed)
    },
    syncSceneSelectionFromStatement(
      path: string,
      statementId: number | undefined,
      options?: {
        lastEditedStatementId?: number | undefined
        lineNumber?: number | undefined
      },
    ): void {
      syncSceneSelectionFromStatement(getEditableSession, path, statementId, options)
    },
    syncSceneSelectionFromTextLine(
      path: string,
      lineNumber: number | undefined,
      patch?: Partial<Pick<SceneSelectionState, 'lastEditedStatementId'>>,
    ): void {
      syncSceneSelectionFromTextLine(getEditableSession, path, lineNumber, patch)
    },
  }
}

export function getSceneSession(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
): EditableSceneSession | undefined {
  const session = getEditableSession(path)
  if (
    !session
    || session.document.model.kind !== 'scene'
    || !session.sceneSelection
    || !session.scenePresentation
  ) {
    return undefined
  }

  return session as EditableSceneSession
}

export function getSceneSelection(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
): SceneSelectionState | undefined {
  return getSceneSession(getEditableSession, path)?.sceneSelection
}

export function patchSceneSelection(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
  patch: Partial<SceneSelectionState>,
) {
  const selection = getSceneSelection(getEditableSession, path)
  if (!selection) {
    return
  }
  Object.assign(selection, patch)
}

export function getScenePresentationState(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
): ScenePresentationState | undefined {
  return getSceneSession(getEditableSession, path)?.scenePresentation
}

export function isSceneStatementCollapsed(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
  statementId: number,
): boolean {
  return isSceneStatementCollapsedForPresentation(
    getScenePresentationState(getEditableSession, path),
    statementId,
  )
}

export function setSceneStatementCollapsed(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
  statementId: number,
  collapsed: boolean,
) {
  const presentation = getScenePresentationState(getEditableSession, path)
  if (!presentation) {
    return
  }
  setSceneStatementCollapsedForPresentation(presentation, statementId, collapsed)
}

export function getSceneDocumentState(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
): DocumentStateOfKind<'scene'> | undefined {
  return getSceneSession(getEditableSession, path)?.document
}

export function syncSceneSelectionFromTextLine(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
  lineNumber: number | undefined,
  patch: Partial<Pick<SceneSelectionState, 'lastEditedStatementId'>> = {},
) {
  const docEntry = getSceneDocumentState(getEditableSession, path)
  if (!docEntry) {
    return
  }

  const selectedStatementId = lineNumber === undefined
    ? undefined
    : computeStatementIdFromLineNumber(docEntry.model.statements, lineNumber)

  patchSceneSelection(getEditableSession, path, {
    ...patch,
    lastLineNumber: lineNumber,
    selectedStatementId,
  })
}

export function syncSceneSelectionFromStatement(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
  statementId: number | undefined,
  options: {
    lastEditedStatementId?: number | undefined
    lineNumber?: number | undefined
  } = {},
) {
  const docEntry = getSceneDocumentState(getEditableSession, path)
  if (!docEntry) {
    return
  }

  const resolvedLineNumber = options.lineNumber ?? (
    statementId === undefined
      ? undefined
      : computeLineNumberFromStatementId(docEntry.model.statements, statementId)
  )

  patchSceneSelection(getEditableSession, path, {
    selectedStatementId: statementId,
    lastEditedStatementId: options.lastEditedStatementId,
    lastLineNumber: resolvedLineNumber,
  })
}

export function getSceneStatements(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
): SceneStatement[] | undefined {
  return getSceneDocumentState(getEditableSession, path)?.model.statements
}

export function resolveCurrentSceneSelectionState(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
) {
  const statements = getSceneStatements(getEditableSession, path)
  if (!statements) {
    return
  }
  const selection = getSceneSelection(getEditableSession, path)
  return resolveSceneSelectionState(statements, selection)
}

export function reconcileSceneSelection(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
) {
  const statements = getSceneStatements(getEditableSession, path)
  const selection = getSceneSelection(getEditableSession, path)
  if (!statements || !selection) {
    return
  }

  const resultPatch = reconcileSceneSelectionState(statements, selection)
  if (resultPatch) {
    patchSceneSelection(getEditableSession, path, resultPatch)
  }
}

export function reconcileScenePresentation(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
) {
  const statements = getSceneStatements(getEditableSession, path)
  if (!statements) {
    return
  }

  reconcileScenePresentationState(
    statements,
    getScenePresentationState(getEditableSession, path),
  )
}

export function getSceneSelectionIndex(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
): number | undefined {
  return resolveCurrentSceneSelectionState(getEditableSession, path)?.index
}

export function getSelectedSceneStatement(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
): SceneStatement | undefined {
  const statements = getSceneStatements(getEditableSession, path)
  if (!statements) {
    return undefined
  }
  return getSelectedSceneStatementForSelection(
    statements,
    getSceneSelection(getEditableSession, path),
  )
}

export function getSelectedSceneStatementPreviousSpeaker(
  getEditableSession: (path: string) => EditableEditorSession | undefined,
  path: string,
): string {
  const statements = getSceneStatements(getEditableSession, path)
  if (!statements) {
    return ''
  }
  return getSelectedSceneStatementPreviousSpeakerForSelection(
    statements,
    getSceneSelection(getEditableSession, path),
  )
}
