import { normalizeTextLineEnding } from '~/domain/document/document-model'
import { encodeTextFile } from '~/domain/document/file-codec'
import { consumePendingDocumentWrite, registerPendingDocumentWrite } from '~/services/document-write-intents'
import { gameFs } from '~/services/game-fs'
import { AppError } from '~/types/errors'

import { markDocumentClean } from './editor-document-state'
import { getTextProjectionPersistedContent, normalizeAnimationTextProjection } from './editor-session'

import type { EditorDocumentActionContext } from './editor-document-actions'
import type { DocumentState } from './editor-document-state'
import type { EditableEditorState, TextProjectionState, VisualProjectionState } from './editor-session'

export interface EditorDocumentSaveContext extends EditorDocumentActionContext {
  createEditorError: (message: string) => AppError
  getEditableState: (path: string) => EditableEditorState | undefined
  getTextProjectionState: (path: string) => TextProjectionState | undefined
  getVisualProjectionState: (path: string) => VisualProjectionState | undefined
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
  savedContent: string,
  savedAt: Date,
): void {
  const {
    state,
    docEntry,
    savedSequenceNumber,
    savedRevisionNumber,
  } = saveContext

  state.lastSavedTime = savedAt
  if (docEntry.engine.revisionNumber === savedRevisionNumber) {
    markDocumentClean(docEntry, savedSequenceNumber)
  }
  docEntry.savedTextContent = savedContent
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
}

export async function saveEditorDocument(
  context: EditorDocumentSaveContext,
  path: string,
  saveSnapshot: EditorDocumentSaveSnapshot = createEditorDocumentSaveSnapshot(context, path),
): Promise<string> {
  const metadata = saveSnapshot.docEntry.model.metadata
  const finalContent = normalizeTextLineEnding(saveSnapshot.content, metadata.lineEnding)
  const finalBytes = encodeTextFile(finalContent, metadata)

  registerPendingDocumentWrite(path, finalContent, metadata)

  try {
    await gameFs.writeDocumentFile(path, finalBytes)
  } catch (error) {
    consumePendingDocumentWrite(path, finalContent, metadata)
    throw error
  }

  finalizeSavedDocument(context, path, saveSnapshot, finalContent, new Date())
  return finalContent
}
