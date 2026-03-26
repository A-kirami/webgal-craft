import { isAnimationDocumentTextValid } from '~/domain/document/animation-document-codec'
import { captureSceneSelectionSnapshot, computeLineNumberFromStatementId, createSceneSelectionSnapshot } from '~/domain/document/scene-selection'
import { applyTransactionToModel } from '~/domain/document/transaction-apply'
import { cloneAnimationFrame } from '~/domain/stage/animation-frame'
import { AnimationFrame } from '~/domain/stage/types'

import { getDocumentTextContent, invalidateDocumentTextCache, isDocumentDirty } from './editor-document-state'
import { getTextProjectionPersistedContent, isTextProjectionDirty } from './editor-session'
import { computeTransactionInverse } from './editor-transaction-inverse'

import type { DocumentState } from './editor-document-state'
import type { TextProjectionState } from './editor-session'
import type { SceneStatement } from '~/domain/document/document-model'
import type { SceneSelectionSnapshot, SceneSelectionState } from '~/domain/document/scene-selection'
import type {
  EditorHistoryMetadata,
  HistoryEntry,
  SceneTransactionOperation,
  Transaction,
  TransactionSource,
} from '~/domain/document/transaction'

export interface ApplyDocumentTransactionOptions {
  transaction?: Transaction
  /** 显式提供 inverse；未提供时由 computeInverse 自动计算 */
  inverse?: Transaction
  source?: TransactionSource
  skipHistory?: boolean
  editorMetadata?: EditorHistoryMetadata
  sceneSelectionAfter?: SceneSelectionSnapshot
}

export interface DocumentStateAccessor {
  getDocumentState: (path: string) => DocumentState | undefined
}

export interface TextProjectionStateAccessor {
  getTextProjectionState: (path: string) => TextProjectionState | undefined
}

export interface SceneSelectionStateAccessor {
  getSceneSelection: (path: string) => SceneSelectionState | undefined
}

export interface DocumentStateSyncActions {
  patchSceneSelection: (path: string, patch: Partial<SceneSelectionState>) => void
  syncStateFromDocument: (path: string) => void
}

export interface EditorDocumentActionContext extends
  DocumentStateAccessor,
  SceneSelectionStateAccessor,
  TextProjectionStateAccessor,
  DocumentStateSyncActions {}

export function createEditorDocumentActions(context: EditorDocumentActionContext) {
  return {
    applyAnimationFrameDelete(path: string, index: number): void {
      applyAnimationFrameDelete(context, path, index)
    },
    applyAnimationFrameInsert(
      path: string,
      afterIndex: number | undefined,
      frame: AnimationFrame,
    ): void {
      applyAnimationFrameInsert(context, path, afterIndex, frame)
    },
    applyAnimationFrameReorder(path: string, fromIndex: number, toIndex: number): void {
      applyAnimationFrameReorder(context, path, fromIndex, toIndex)
    },
    applyAnimationFrameUpdate(path: string, index: number, frame: Partial<AnimationFrame>): void {
      applyAnimationFrameUpdate(context, path, index, frame)
    },
    applySceneStatementDelete(path: string, statementId: number): void {
      applySceneStatementDelete(context, path, statementId)
    },
    applySceneStatementInsert(
      path: string,
      insertedStatements: readonly Pick<SceneStatement, 'id' | 'rawText'>[],
      insertAt: number,
    ): void {
      applySceneStatementInsert(context, path, insertedStatements, insertAt)
    },
    applySceneStatementUpdate(
      path: string,
      statementId: number,
      rawText: string,
      source?: Extract<TransactionSource, 'visual' | 'effect-editor'>,
    ): void {
      applySceneStatementUpdate(context, path, statementId, rawText, source)
    },
    applyTextDocumentContent(
      path: string,
      nextContent: string,
      options?: {
        editorMetadata?: EditorHistoryMetadata
        source?: TransactionSource
      },
    ): void {
      applyTextDocumentContent(context, path, nextContent, options)
    },
    redoDocument(path: string): HistoryApplyResult {
      return redoDocument(context, path)
    },
    replaceTextDocumentContent(
      path: string,
      content: string,
      options?: {
        editorMetadata?: EditorHistoryMetadata
        preserveDraftText?: boolean
        source?: TransactionSource
      },
    ): boolean {
      return replaceTextDocumentContent(context, path, content, options)
    },
    undoDocument(path: string): HistoryApplyResult {
      return undoDocument(context, path)
    },
  }
}

export function applyTransactionToDocumentModel(
  context: DocumentStateAccessor,
  path: string,
  transaction: Transaction,
): boolean {
  const docEntry = context.getDocumentState(path)
  if (!docEntry) {
    return false
  }

  const nextModel = applyTransactionToModel(docEntry.model, transaction)
  if (!nextModel) {
    return false
  }

  docEntry.model = nextModel
  invalidateDocumentTextCache(docEntry)
  return true
}

export function applyDocumentTransaction(
  context: DocumentStateAccessor & SceneSelectionStateAccessor & DocumentStateSyncActions,
  path: string,
  options: ApplyDocumentTransactionOptions,
): boolean {
  const docEntry = context.getDocumentState(path)
  if (!docEntry || !options.transaction) {
    return false
  }

  try {
    const sceneSelectionBefore = options.sceneSelectionAfter
      ? captureSceneSelectionSnapshot(context.getSceneSelection(path))
      : undefined
    const inverse = options.inverse ?? computeTransactionInverse(docEntry, options.transaction)
    if (!applyTransactionToDocumentModel(context, path, options.transaction)) {
      logger.warn(`事务应用失败 (${path}): ${options.transaction.type}`)
      return false
    }

    const sceneSelectionAfter = options.sceneSelectionAfter
      ? resolveSceneSelectionSnapshot(docEntry, options.sceneSelectionAfter)
      : undefined
    const historyMetadata = sceneSelectionAfter
      ? {
        ...options.editorMetadata,
        sceneSelection: {
          before: sceneSelectionBefore,
          after: sceneSelectionAfter,
        },
      } satisfies EditorHistoryMetadata
      : options.editorMetadata

    docEntry.engine.commit(
      options.transaction,
      inverse,
      options.source ?? 'visual',
      options.skipHistory ?? false,
      historyMetadata,
    )

    context.syncStateFromDocument(path)
    if (sceneSelectionAfter) {
      context.patchSceneSelection(path, sceneSelectionAfter)
    }
    return true
  } catch (error) {
    logger.warn(`事务同步失败 (${path}): ${error}`)
    return false
  }
}

export function applySceneStatementUpdate(
  context: DocumentStateAccessor & SceneSelectionStateAccessor & DocumentStateSyncActions,
  path: string,
  statementId: number,
  rawText: string,
  source: Extract<TransactionSource, 'visual' | 'effect-editor'> = 'visual',
): void {
  applyDocumentTransaction(context, path, {
    sceneSelectionAfter: createSceneSelectionSnapshot(statementId, {
      lastEditedStatementId: statementId,
    }),
    source,
    transaction: { type: 'statement:update', id: statementId, rawText },
  })
}

export function applySceneStatementInsert(
  context: DocumentStateAccessor & SceneSelectionStateAccessor & DocumentStateSyncActions,
  path: string,
  insertedStatements: readonly Pick<SceneStatement, 'id' | 'rawText'>[],
  insertAt: number,
): void {
  if (insertedStatements.length === 0) {
    return
  }

  const docEntry = context.getDocumentState(path)
  if (!docEntry || docEntry.model.kind !== 'scene') {
    return
  }

  const previousStatement = insertAt > 0 ? docEntry.model.statements[insertAt - 1] : undefined
  // eslint-disable-next-line unicorn/no-null -- 事务协议以 null 表示插入到首位
  let afterId = previousStatement?.id ?? null
  const operations: SceneTransactionOperation[] = []
  for (const statement of insertedStatements) {
    operations.push({ type: 'statement:insert', id: statement.id, afterId, rawText: statement.rawText })
    afterId = statement.id
  }

  const transaction: Transaction = operations.length === 1
    ? operations[0]
    : { type: 'statement:batch', operations }
  const lastInsertedStatementId = insertedStatements.at(-1)?.id

  applyDocumentTransaction(context, path, {
    sceneSelectionAfter: createSceneSelectionSnapshot(lastInsertedStatementId, {
      lastEditedStatementId: lastInsertedStatementId,
    }),
    source: 'visual',
    transaction,
  })
}

export function applySceneStatementDelete(
  context: DocumentStateAccessor & SceneSelectionStateAccessor & DocumentStateSyncActions,
  path: string,
  statementId: number,
): void {
  const docEntry = context.getDocumentState(path)
  if (!docEntry || docEntry.model.kind !== 'scene') {
    return
  }

  applyDocumentTransaction(context, path, {
    sceneSelectionAfter: resolveSceneSelectionAfterDelete(
      docEntry.model.statements,
      context.getSceneSelection(path),
      statementId,
    ),
    source: 'visual',
    transaction: { type: 'statement:delete', id: statementId },
  })
}

export function applyAnimationFrameUpdate(
  context: DocumentStateAccessor & SceneSelectionStateAccessor & DocumentStateSyncActions,
  path: string,
  index: number,
  frame: Partial<AnimationFrame>,
): void {
  applyDocumentTransaction(context, path, {
    source: 'visual',
    transaction: { type: 'animation:update-frame', index, frame: cloneAnimationFrame(frame) },
  })
}

export function applyAnimationFrameInsert(
  context: DocumentStateAccessor & SceneSelectionStateAccessor & DocumentStateSyncActions,
  path: string,
  afterIndex: number | undefined,
  frame: AnimationFrame,
): void {
  applyDocumentTransaction(context, path, {
    source: 'visual',
    transaction: { type: 'animation:insert-frame', afterIndex, frame: cloneAnimationFrame(frame) },
  })
}

export function applyAnimationFrameDelete(
  context: DocumentStateAccessor & SceneSelectionStateAccessor & DocumentStateSyncActions,
  path: string,
  index: number,
): void {
  applyDocumentTransaction(context, path, {
    source: 'visual',
    transaction: { type: 'animation:delete-frame', index },
  })
}

export function applyAnimationFrameReorder(
  context: DocumentStateAccessor & SceneSelectionStateAccessor & DocumentStateSyncActions,
  path: string,
  fromIndex: number,
  toIndex: number,
): void {
  if (fromIndex === toIndex) {
    return
  }

  applyDocumentTransaction(context, path, {
    source: 'visual',
    transaction: { type: 'animation:reorder-frame', fromIndex, toIndex },
  })
}

// ============================================================
// 文本文档操作
// ============================================================

export function applyTextDocumentContent(
  context: DocumentStateAccessor & SceneSelectionStateAccessor & DocumentStateSyncActions,
  path: string,
  nextContent: string,
  options: {
    editorMetadata?: EditorHistoryMetadata
    source?: TransactionSource
  } = {},
): void {
  const docEntry = context.getDocumentState(path)
  if (!docEntry) {
    return
  }

  try {
    const previousContent = getDocumentTextContent(docEntry)
    if (previousContent === nextContent) {
      return
    }

    const applied = applyDocumentTransaction(context, path, {
      transaction: { type: 'text:set-content', resultContent: nextContent },
      inverse: { type: 'text:set-content', resultContent: previousContent },
      source: options.source ?? 'text',
      skipHistory: false,
      editorMetadata: options.editorMetadata,
    })
    if (applied) {
      // 事务应用成功后主动写入缓存，避免下次读取时重新序列化
      docEntry.cachedTextContent = nextContent
    }
  } catch (error) {
    logger.warn(`文本事务提交失败 (${path}): ${error}`)
  }
}

export function replaceTextDocumentContent(
  context: DocumentStateAccessor & SceneSelectionStateAccessor & DocumentStateSyncActions & Pick<TextProjectionStateAccessor, 'getTextProjectionState'>,
  path: string,
  content: string,
  options: {
    editorMetadata?: EditorHistoryMetadata
    preserveDraftText?: boolean
    source?: TransactionSource
  } = {},
): boolean {
  const docEntry = context.getDocumentState(path)
  const textState = context.getTextProjectionState(path)
  if (!docEntry || !textState) {
    return false
  }

  const previousContent = resolvePreviousReplaceAllContent(docEntry, textState)
  if (previousContent === content && textState.syncError === undefined) {
    return true
  }

  if (
    docEntry.model.kind === 'animation'
    && !isDocumentDirty(docEntry)
    && content === docEntry.savedTextContent
  ) {
    textState.textContent = content
    textState.textSource = options.preserveDraftText ? 'draft' : 'projection'
    textState.syncError = undefined
    context.syncStateFromDocument(path)
    return true
  }

  const applied = applyDocumentTransaction(context, path, {
    transaction: { type: 'replace-all', content },
    inverse: {
      type: 'replace-all',
      content: previousContent,
      metadata: {
        encoding: docEntry.model.metadata.encoding,
        lineEnding: docEntry.model.metadata.lineEnding,
      },
    },
    source: options.source ?? 'text',
    editorMetadata: options.editorMetadata,
  })
  if (!applied) {
    return false
  }

  textState.syncError = undefined
  if (options.preserveDraftText) {
    textState.textContent = content
    textState.textSource = 'draft'
    textState.syncError = undefined
  }
  return true
}

// ============================================================
// 撤销/重做
// ============================================================

export interface HistoryApplyResult {
  applied: boolean
  entry?: HistoryEntry
}

export function undoDocument(
  context: DocumentStateAccessor & SceneSelectionStateAccessor & TextProjectionStateAccessor & DocumentStateSyncActions,
  path: string,
): HistoryApplyResult {
  const docEntry = context.getDocumentState(path)
  if (!docEntry) {
    return { applied: false }
  }

  const entry = docEntry.engine.undo()
  if (!entry) {
    return { applied: false }
  }

  let applied = false
  try {
    applied = applyTransactionToDocumentModel(context, path, entry.inverse)
  } catch (error) {
    if (!shouldSilenceAnimationHistoryFailure(docEntry, entry.inverse)) {
      logger.warn(`撤销事务异常 (${path}): ${error}`)
    }
  }
  if (!applied) {
    if (!shouldSilenceAnimationHistoryFailure(docEntry, entry.inverse)) {
      logger.warn(`撤销事务失败 (${path}): ${entry.inverse.type}`)
    }
    docEntry.engine.redo()
    return { applied: false }
  }

  context.syncStateFromDocument(path)
  syncAnimationTextProjectionAfterHistoryApply(context, path, docEntry, entry.inverse)
  restoreSceneSelectionFromHistory(context, path, entry.editorMetadata?.sceneSelection?.before)
  return { applied: true, entry }
}

export function redoDocument(
  context: DocumentStateAccessor & SceneSelectionStateAccessor & TextProjectionStateAccessor & DocumentStateSyncActions,
  path: string,
): HistoryApplyResult {
  const docEntry = context.getDocumentState(path)
  if (!docEntry) {
    return { applied: false }
  }

  const entry = docEntry.engine.redo()
  if (!entry) {
    return { applied: false }
  }

  let applied = false
  try {
    applied = applyTransactionToDocumentModel(context, path, entry.forward)
  } catch (error) {
    if (!shouldSilenceAnimationHistoryFailure(docEntry, entry.forward)) {
      logger.warn(`重做事务异常 (${path}): ${error}`)
    }
  }
  if (!applied) {
    if (!shouldSilenceAnimationHistoryFailure(docEntry, entry.forward)) {
      logger.warn(`重做事务失败 (${path}): ${entry.forward.type}`)
    }
    docEntry.engine.undo()
    return { applied: false }
  }

  context.syncStateFromDocument(path)
  syncAnimationTextProjectionAfterHistoryApply(context, path, docEntry, entry.forward)
  restoreSceneSelectionFromHistory(context, path, entry.editorMetadata?.sceneSelection?.after)
  return { applied: true, entry }
}

function syncAnimationTextProjectionAfterHistoryApply(
  context: TextProjectionStateAccessor,
  path: string,
  document: DocumentState,
  transaction: Transaction,
) {
  const textState = context.getTextProjectionState(path)
  if (!textState || textState.kind !== 'animation') {
    return
  }

  if (transaction.type === 'replace-all') {
    textState.textContent = transaction.content
    textState.textSource = 'draft'
    textState.syncError = undefined
    textState.isDirty = isTextProjectionDirty(document, textState)
    return
  }

  textState.textContent = getDocumentTextContent(document)
  textState.textSource = 'projection'
  textState.syncError = undefined
  textState.isDirty = isTextProjectionDirty(document, textState)
}

function shouldSilenceAnimationHistoryFailure(
  document: DocumentState,
  transaction: Transaction,
): boolean {
  return document.model.kind === 'animation'
    && transaction.type === 'replace-all'
    && !isAnimationDocumentTextValid(transaction.content)
}

function resolvePreviousReplaceAllContent(
  document: DocumentState,
  textState: TextProjectionState,
): string {
  return getTextProjectionPersistedContent(document, textState)
}

function resolveSceneSelectionSnapshot(
  docEntry: DocumentState,
  snapshot: SceneSelectionSnapshot,
): SceneSelectionSnapshot {
  if (docEntry.model.kind !== 'scene' || snapshot.lastLineNumber !== undefined) {
    return snapshot
  }

  const lineNumber = snapshot.selectedStatementId === undefined
    ? undefined
    : computeLineNumberFromStatementId(docEntry.model.statements, snapshot.selectedStatementId)

  return {
    ...snapshot,
    lastLineNumber: lineNumber,
  }
}

function resolveSceneSelectionAfterDelete(
  statements: readonly SceneStatement[],
  selection: SceneSelectionState | undefined,
  deletedStatementId: number,
): SceneSelectionSnapshot {
  const snapshot = captureSceneSelectionSnapshot(selection)
  const deletedIndex = statements.findIndex(statement => statement.id === deletedStatementId)
  const nextStatement = deletedIndex === -1
    ? undefined
    : statements[deletedIndex + 1] ?? statements[deletedIndex - 1]

  if (snapshot.selectedStatementId === deletedStatementId) {
    snapshot.selectedStatementId = nextStatement?.id
    snapshot.lastEditedStatementId = nextStatement?.id
  } else if (snapshot.lastEditedStatementId === deletedStatementId) {
    snapshot.lastEditedStatementId = snapshot.selectedStatementId
  }

  snapshot.lastLineNumber = undefined
  return snapshot
}

function restoreSceneSelectionFromHistory(
  context: SceneSelectionStateAccessor & DocumentStateSyncActions,
  path: string,
  snapshot: SceneSelectionSnapshot | undefined,
) {
  if (!snapshot) {
    return
  }

  context.patchSceneSelection(path, snapshot)
}
