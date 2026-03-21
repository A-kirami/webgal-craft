import { encodeTextFile } from '~/models/file-codec'
import { registerPendingDocumentWrite } from '~/services/document-write-intents'

import { markDocumentClean, resolveSceneCursor } from './editor-document-state'
import { getTextProjectionPersistedContent, normalizeAnimationTextProjection } from './editor-session'

import type { EditorDocumentActionContext } from './editor-document-actions'
import type { DocumentState } from './editor-document-state'
import type {
  EditableEditorState,
  TextProjectionState,
  VisualProjectionState,
} from './editor-session'
import type { SceneSelectionState } from '~/models/scene-selection'

export interface EditorDocumentSaveContext extends EditorDocumentActionContext {
  createEditorError: (message: string) => AppError
  getEditableState: (path: string) => EditableEditorState | undefined
  getSceneSelection: (path: string) => SceneSelectionState | undefined
  getTextProjectionState: (path: string) => TextProjectionState | undefined
  getVisualProjectionState: (path: string) => VisualProjectionState | undefined
  syncScenePreview: (path: string, lineNumber: number, lineText: string, force?: boolean) => void
}

export interface EditorDocumentSaveSnapshot {
  state: EditableEditorState
  docEntry: DocumentState
  content: string
  savedSequenceNumber: number
  savedRevisionNumber: number
}

export function createEditorDocumentSaveSnapshot(
  context: EditorDocumentSaveContext,
  path: string,
): EditorDocumentSaveSnapshot {
  const state = context.getEditableState(path)
  if (!state) {
    throw context.createEditorError(`文件状态不存在: ${path}`)
  }

  const docEntry = context.getDocumentState(path)
  if (!docEntry) {
    throw context.createEditorError(`文档模型不存在: ${path}`)
  }

  const textState = context.getTextProjectionState(path)

  return {
    state,
    docEntry,
    content: textState
      ? getTextProjectionPersistedContent(docEntry, textState)
      : docEntry.savedTextContent,
    savedSequenceNumber: docEntry.engine.sequenceNumber,
    savedRevisionNumber: docEntry.engine.revisionNumber,
  }
}

function finalizeSavedDocument(
  context: EditorDocumentSaveContext,
  path: string,
  saveContext: EditorDocumentSaveSnapshot,
  savedAt: Date,
): void {
  const {
    state,
    docEntry,
    content,
    savedSequenceNumber,
    savedRevisionNumber,
  } = saveContext

  state.lastSavedTime = savedAt
  if (docEntry.engine.revisionNumber === savedRevisionNumber) {
    markDocumentClean(docEntry, savedSequenceNumber)
  }
  docEntry.savedTextContent = content
  docEntry.engine.markBoundary()
  context.syncStateFromDocument(path)

  const textState = context.getTextProjectionState(path)
  if (textState) {
    if (docEntry.model.kind === 'animation' && state.projection === 'visual' && textState.syncError === undefined) {
      normalizeAnimationTextProjection(textState, docEntry)
    }
    textState.lastSavedTime = savedAt
  }

  const visualState = context.getVisualProjectionState(path)
  if (visualState) {
    visualState.lastSavedTime = savedAt
  }

  if (docEntry.model.kind === 'scene') {
    const selection = context.getSceneSelection(path)
    const sceneCursor = resolveSceneCursor(content, selection?.lastLineNumber)
    context.syncScenePreview(path, sceneCursor.lineNumber, sceneCursor.lineText)
  }
}

export async function saveEditorDocument(
  context: EditorDocumentSaveContext,
  path: string,
  saveSnapshot: EditorDocumentSaveSnapshot = createEditorDocumentSaveSnapshot(context, path),
): Promise<void> {
  await gameFs.writeDocumentFile(
    path,
    encodeTextFile(saveSnapshot.content, saveSnapshot.docEntry.model.metadata),
  )
  registerPendingDocumentWrite(path, saveSnapshot.content, saveSnapshot.docEntry.model.metadata)
  finalizeSavedDocument(context, path, saveSnapshot, new Date())
}
