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
import type { AbsPath } from '~/domain/path'
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
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
) {
  return {
    getScenePresentationState(path: AbsPath): ScenePresentationState | undefined {
      return getScenePresentationState(getEditableSession, path)
    },
    getSceneSelection(path: AbsPath): SceneSelectionState | undefined {
      return getSceneSelection(getEditableSession, path)
    },
    getSceneSelectionIndex(path: AbsPath): number | undefined {
      return getSceneSelectionIndex(getEditableSession, path)
    },
    getSelectedSceneStatement(path: AbsPath): SceneStatement | undefined {
      return getSelectedSceneStatement(getEditableSession, path)
    },
    getSelectedSceneStatementPreviousSpeaker(path: AbsPath): string {
      return getSelectedSceneStatementPreviousSpeaker(getEditableSession, path)
    },
    isSceneStatementCollapsed(path: AbsPath, statementId: number): boolean {
      return isSceneStatementCollapsed(getEditableSession, path, statementId)
    },
    patchSceneSelection(path: AbsPath, patch: Partial<SceneSelectionState>): void {
      patchSceneSelection(getEditableSession, path, patch)
    },
    reconcileScenePresentation(path: AbsPath): void {
      reconcileScenePresentation(getEditableSession, path)
    },
    reconcileSceneSelection(path: AbsPath): void {
      reconcileSceneSelection(getEditableSession, path)
    },
    setSceneStatementCollapsed(path: AbsPath, statementId: number, collapsed: boolean): void {
      setSceneStatementCollapsed(getEditableSession, path, statementId, collapsed)
    },
    syncSceneSelectionFromStatement(
      path: AbsPath,
      statementId: number | undefined,
      options?: {
        lastEditedStatementId?: number | undefined
        lineNumber?: number | undefined
      },
    ): void {
      syncSceneSelectionFromStatement(getEditableSession, path, statementId, options)
    },
    syncSceneSelectionFromTextLine(
      path: AbsPath,
      lineNumber: number | undefined,
      patch?: Partial<Pick<SceneSelectionState, 'lastEditedStatementId'>>,
    ): void {
      syncSceneSelectionFromTextLine(getEditableSession, path, lineNumber, patch)
    },
  }
}

export function getSceneSession(
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
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
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
): SceneSelectionState | undefined {
  return getSceneSession(getEditableSession, path)?.sceneSelection
}

export function patchSceneSelection(
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
  patch: Partial<SceneSelectionState>,
) {
  const selection = getSceneSelection(getEditableSession, path)
  if (!selection) {
    return
  }
  Object.assign(selection, patch)
}

export function getScenePresentationState(
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
): ScenePresentationState | undefined {
  return getSceneSession(getEditableSession, path)?.scenePresentation
}

export function isSceneStatementCollapsed(
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
  statementId: number,
): boolean {
  return isSceneStatementCollapsedForPresentation(
    getScenePresentationState(getEditableSession, path),
    statementId,
  )
}

export function setSceneStatementCollapsed(
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
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
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
): DocumentStateOfKind<'scene'> | undefined {
  return getSceneSession(getEditableSession, path)?.document
}

export function syncSceneSelectionFromTextLine(
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
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
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
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
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
): SceneStatement[] | undefined {
  return getSceneDocumentState(getEditableSession, path)?.model.statements
}

export function resolveCurrentSceneSelectionState(
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
) {
  const statements = getSceneStatements(getEditableSession, path)
  if (!statements) {
    return
  }
  const selection = getSceneSelection(getEditableSession, path)
  return resolveSceneSelectionState(statements, selection)
}

export function reconcileSceneSelection(
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
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
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
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
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
): number | undefined {
  return resolveCurrentSceneSelectionState(getEditableSession, path)?.index
}

export function getSelectedSceneStatement(
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
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
  getEditableSession: (path: AbsPath) => EditableEditorSession | undefined,
  path: AbsPath,
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
