import { isAnimationDocumentTextValid } from '~/models/animation-document-codec'
import { createDocumentModel, normalizeTextLineEnding } from '~/models/document-model'
import { serializeDocument } from '~/models/serializer'
import { EditHistory } from '~/models/transaction'

import type {
  DocumentKind,
  DocumentModel,
  TextMetadata,
} from '~/models/document-model'

export interface DocumentState {
  model: DocumentModel
  engine: EditHistory
  canRedo: boolean
  canUndo: boolean
  historyRevision: number
  savedSequenceNumber: number
  savedTextContent: string
  /** 缓存的文本内容，model 变更后置为 undefined，按需重新序列化 */
  cachedTextContent: string | undefined
}

export type DocumentStateOfKind<TKind extends DocumentKind> = DocumentState & {
  model: Extract<DocumentModel, { kind: TKind }>
}

export interface LoadedTextProjectionSnapshot {
  content: string
  source: 'projection' | 'draft'
  syncError?: 'invalid-animation-json'
}

export interface LoadedDocumentState {
  model: DocumentModel
  savedTextContent: string
  textProjection?: LoadedTextProjectionSnapshot
}

export function createLoadedDocumentState(
  kind: DocumentKind,
  content: string,
  metadata?: Partial<TextMetadata>,
): LoadedDocumentState {
  if (kind === 'animation' && !isAnimationDocumentTextValid(content)) {
    return {
      model: createDocumentModel({
        kind: 'animation',
        content: '[]',
        metadata,
      }),
      savedTextContent: content,
      textProjection: {
        content,
        source: 'draft',
        syncError: 'invalid-animation-json',
      },
    }
  }

  if (kind === 'animation') {
    return {
      model: createDocumentModel({
        kind,
        content,
        metadata,
      }),
      savedTextContent: content,
      textProjection: {
        content,
        source: 'draft',
      },
    }
  }

  return {
    model: createDocumentModel({
      kind,
      content,
      metadata,
    }),
    savedTextContent: content,
  }
}

export function createDocumentState(model: DocumentModel, savedTextContent: string = serializeDocument(model)): DocumentState {
  const engine = markRaw(new EditHistory())
  return shallowReactive({
    model,
    engine,
    canRedo: engine.canRedo,
    canUndo: engine.canUndo,
    historyRevision: engine.revisionNumber,
    savedSequenceNumber: 0,
    savedTextContent,
    cachedTextContent: undefined,
  }) as DocumentState
}

export function syncDocumentHistoryState(document: DocumentState): void {
  document.canUndo = document.engine.canUndo
  document.canRedo = document.engine.canRedo
  document.historyRevision = document.engine.revisionNumber
}

/** 获取文档的文本内容，优先使用缓存，缓存未命中时序列化并写入缓存 */
export function getDocumentTextContent(doc: DocumentState): string {
  if (doc.cachedTextContent !== undefined) {
    return doc.cachedTextContent
  }
  const content = serializeDocument(doc.model)
  doc.cachedTextContent = content
  return content
}

/** model 变更后调用，使文本缓存失效 */
export function invalidateDocumentTextCache(doc: DocumentState): void {
  doc.cachedTextContent = undefined
}

export function isDocumentDirty(document: DocumentState): boolean {
  return document.engine.sequenceNumber !== document.savedSequenceNumber
}

export function markDocumentClean(
  document: DocumentState,
  sequenceNumber: number = document.engine.sequenceNumber,
): void {
  document.savedSequenceNumber = sequenceNumber
}

export function resolveSceneCursor(
  content: string,
  preferredLineNumber?: number,
): { lineNumber: number, lineText: string } {
  const lines = normalizeTextLineEnding(content, '\n').split('\n')
  const lineCount = Math.max(lines.length, 1)
  const lineNumber = Math.min(Math.max(preferredLineNumber ?? 1, 1), lineCount)

  return {
    lineNumber,
    lineText: lines[lineNumber - 1] ?? '',
  }
}
