import { applyTransactionToModel } from '~/domain/document/transaction-apply'
import { cloneAnimationFrame } from '~/domain/stage/animation-frame'

import { getDocumentTextContent } from './editor-document-state'

import type { DocumentState, DocumentStateOfKind } from './editor-document-state'
import type { AnimationTransactionOperation, SceneTransactionOperation, Transaction } from '~/domain/document/transaction'

/**
 * 从当前文档状态计算事务的逆操作。
 *
 * 在事务应用前调用，基于当前 model 构造精确 inverse。
 */
export function computeTransactionInverse(
  docEntry: DocumentState,
  tx: Transaction,
): Transaction {
  switch (tx.type) {
    case 'text:set-content': {
      return {
        type: 'text:set-content',
        resultContent: getDocumentTextContent(docEntry),
      }
    }
    case 'replace-all': {
      return {
        type: 'replace-all',
        content: getDocumentTextContent(docEntry),
        metadata: {
          encoding: docEntry.model.metadata.encoding,
          lineEnding: docEntry.model.metadata.lineEnding,
        },
      }
    }
    case 'statement:update': {
      return computeStatementUpdateInverse(docEntry, tx.id)
    }
    case 'statement:insert': {
      return { type: 'statement:delete', id: tx.id }
    }
    case 'statement:delete': {
      return computeStatementDeleteInverse(docEntry, tx.id)
    }
    case 'statement:reorder': {
      return { type: 'statement:reorder', fromIndex: tx.toIndex, toIndex: tx.fromIndex }
    }
    case 'statement:batch': {
      return computeSceneBatchInverse(docEntry, tx.operations)
    }
    case 'animation:update-frame': {
      return computeAnimationUpdateInverse(docEntry, tx.index)
    }
    case 'animation:insert-frame': {
      const insertIndex = tx.afterIndex === undefined
        ? 0
        : Math.min(tx.afterIndex + 1, getAnimationFrameCount(docEntry))
      return { type: 'animation:delete-frame', index: insertIndex }
    }
    case 'animation:delete-frame': {
      return computeAnimationDeleteInverse(docEntry, tx.index)
    }
    case 'animation:reorder-frame': {
      return { type: 'animation:reorder-frame', fromIndex: tx.toIndex, toIndex: tx.fromIndex }
    }
    case 'animation:batch': {
      return computeAnimationBatchInverse(docEntry, tx.operations)
    }
    default: {
      logger.warn(`无法计算逆操作，回退到全量快照: ${(tx as Transaction).type}`)
      return createFallbackInverse(docEntry)
    }
  }
}

function computeStatementUpdateInverse(docEntry: DocumentState, statementId: number): Transaction {
  if (docEntry.model.kind !== 'scene') {
    return createFallbackInverse(docEntry)
  }

  const statement = docEntry.model.statements.find(sceneStatement => sceneStatement.id === statementId)
  if (!statement) {
    return createFallbackInverse(docEntry)
  }

  return { type: 'statement:update', id: statementId, rawText: statement.rawText }
}

function computeStatementDeleteInverse(docEntry: DocumentState, statementId: number): Transaction {
  if (docEntry.model.kind !== 'scene') {
    return createFallbackInverse(docEntry)
  }

  const sceneDoc = docEntry as DocumentStateOfKind<'scene'>
  const deleteIndex = sceneDoc.model.statements.findIndex(statement => statement.id === statementId)
  const deletedStatement = deleteIndex === -1 ? undefined : sceneDoc.model.statements[deleteIndex]
  if (!deletedStatement) {
    return createFallbackInverse(docEntry)
  }

  const previousStatement = deleteIndex > 0 ? sceneDoc.model.statements[deleteIndex - 1] : undefined
  return {
    type: 'statement:insert',
    id: deletedStatement.id,
    // eslint-disable-next-line unicorn/no-null -- 事务协议以 null 表示插入到首位
    afterId: previousStatement?.id ?? null,
    rawText: deletedStatement.rawText,
  }
}

function computeAnimationUpdateInverse(docEntry: DocumentState, index: number): Transaction {
  if (docEntry.model.kind !== 'animation') {
    return createFallbackInverse(docEntry)
  }

  const frame = docEntry.model.frames[index]
  if (!frame) {
    return createFallbackInverse(docEntry)
  }

  return {
    type: 'animation:update-frame',
    index,
    frame: cloneAnimationFrame(frame),
  }
}

function computeAnimationDeleteInverse(docEntry: DocumentState, index: number): Transaction {
  if (docEntry.model.kind !== 'animation') {
    return createFallbackInverse(docEntry)
  }

  const deletedFrame = docEntry.model.frames[index]
  if (!deletedFrame) {
    return createFallbackInverse(docEntry)
  }

  return {
    type: 'animation:insert-frame',
    afterIndex: index - 1 >= 0 ? index - 1 : undefined,
    frame: cloneAnimationFrame(deletedFrame),
  }
}

function getAnimationFrameCount(docEntry: DocumentState): number {
  return docEntry.model.kind === 'animation' ? docEntry.model.frames.length : 0
}

function computeSceneBatchInverse(
  docEntry: DocumentState,
  operations: readonly SceneTransactionOperation[],
): Transaction {
  const operationsInverse = computeSequentialBatchInverses(docEntry, operations)
  if (!operationsInverse) {
    return createFallbackInverse(docEntry)
  }

  return {
    type: 'statement:batch',
    operations: operationsInverse,
  }
}

function computeAnimationBatchInverse(
  docEntry: DocumentState,
  operations: readonly AnimationTransactionOperation[],
): Transaction {
  const operationsInverse = computeSequentialBatchInverses(docEntry, operations)
  if (!operationsInverse) {
    return createFallbackInverse(docEntry)
  }

  return {
    type: 'animation:batch',
    operations: operationsInverse,
  }
}

function computeSequentialBatchInverses<TOperation extends Transaction>(
  docEntry: DocumentState,
  operations: readonly TOperation[],
): TOperation[] | undefined {
  const tempDocEntry: DocumentState = {
    ...docEntry,
    model: structuredClone(docEntry.model),
    cachedTextContent: undefined,
  }
  const inverses: TOperation[] = []

  for (const operation of operations) {
    inverses.push(computeTransactionInverse(tempDocEntry, operation) as TOperation)

    const nextModel = applyTransactionToModel(tempDocEntry.model, operation)
    if (!nextModel) {
      return undefined
    }

    tempDocEntry.model = nextModel
    tempDocEntry.cachedTextContent = undefined
  }

  return inverses.toReversed()
}
function createFallbackInverse(docEntry: DocumentState): Transaction {
  return {
    type: 'replace-all',
    content: getDocumentTextContent(docEntry),
    metadata: {
      encoding: docEntry.model.metadata.encoding,
      lineEnding: docEntry.model.metadata.lineEnding,
    },
  }
}
