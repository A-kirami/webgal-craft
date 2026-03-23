import { cloneAnimationFrame } from '~/helper/animation-frame'
import { AnimationFrame, Point2D } from '~/types/stage'

import { applyTextContentToDocument, replaceDocumentText } from './text-projection'

import type { AnimationDocumentModel, DocumentModel, SceneDocumentModel } from './document-model'
import type { AnimationTransaction, SceneTransaction, Transaction } from './transaction'

// ============================================================
// 事务应用：将 Transaction 应用到 DocumentModel，返回新模型
// ============================================================

/**
 * 将任意事务应用到文档模型，返回新模型。
 * 事务类型与文档 kind 不匹配时返回 undefined。
 */
export function applyTransactionToModel(
  model: DocumentModel,
  transaction: Transaction,
): DocumentModel | undefined {
  switch (transaction.type) {
    case 'statement:update':
    case 'statement:insert':
    case 'statement:delete':
    case 'statement:reorder':
    case 'statement:batch': {
      return model.kind === 'scene'
        ? applySceneTransaction(model, transaction)
        : undefined
    }
    case 'animation:update-frame':
    case 'animation:insert-frame':
    case 'animation:delete-frame':
    case 'animation:reorder-frame':
    case 'animation:batch': {
      return model.kind === 'animation'
        ? applyAnimationTransaction(model, transaction)
        : undefined
    }
    case 'text:set-content': {
      return model.kind === 'animation'
        ? undefined
        : applyTextContentToDocument(model, transaction.resultContent)
    }
    case 'replace-all': {
      return replaceDocumentText(model, transaction.content, transaction.metadata)
    }
    default: {
      return undefined
    }
  }
}

// ============================================================
// 场景事务应用
// ============================================================

export function applySceneTransaction(
  model: SceneDocumentModel,
  transaction: SceneTransaction,
): SceneDocumentModel {
  switch (transaction.type) {
    case 'statement:update': {
      const updateIndex = model.statements.findIndex(statement => statement.id === transaction.id)
      if (updateIndex === -1) {
        return model
      }

      const currentStatement = model.statements[updateIndex]
      if (!currentStatement) {
        return model
      }

      const nextStatements = [...model.statements]
      nextStatements[updateIndex] = {
        ...currentStatement,
        rawText: transaction.rawText,
      }

      return {
        ...model,
        statements: nextStatements,
      }
    }
    case 'statement:insert': {
      const insertIndex = transaction.afterId === null
        ? 0
        : (() => {
            const afterIndex = model.statements.findIndex(statement => statement.id === transaction.afterId)
            return afterIndex === -1 ? model.statements.length : afterIndex + 1
          })()
      const nextStatements = [...model.statements]
      nextStatements.splice(insertIndex, 0, {
        id: transaction.id,
        rawText: transaction.rawText,
      })
      return {
        ...model,
        statements: nextStatements,
      }
    }
    case 'statement:delete': {
      return {
        ...model,
        statements: model.statements.filter(statement => statement.id !== transaction.id),
      }
    }
    case 'statement:reorder': {
      const nextStatements = [...model.statements]
      const movedEntry = nextStatements[transaction.fromIndex]
      if (!movedEntry) {
        return model
      }

      nextStatements.splice(transaction.fromIndex, 1)
      nextStatements.splice(transaction.toIndex, 0, movedEntry)
      return {
        ...model,
        statements: nextStatements,
      }
    }
    case 'statement:batch': {
      let nextModel = model
      for (const operation of transaction.operations) {
        nextModel = applySceneTransaction(nextModel, operation)
      }
      return nextModel
    }
    default: {
      return model
    }
  }
}

// ============================================================
// 动画事务应用
// ============================================================

const animationFrameScalarKeys = [
  'duration',
  'ease',
  'rotation',
  'alpha',
  'blur',
  'brightness',
  'contrast',
  'saturation',
  'gamma',
  'colorRed',
  'colorGreen',
  'colorBlue',
  'bloom',
  'bloomBrightness',
  'bloomBlur',
  'bloomThreshold',
  'bevel',
  'bevelThickness',
  'bevelRotation',
  'bevelSoftness',
  'bevelRed',
  'bevelGreen',
  'bevelBlue',
  'oldFilm',
  'dotFilm',
  'reflectionFilm',
  'glitchFilm',
  'rgbFilm',
  'godrayFilm',
  'shockwaveFilter',
  'radiusAlphaFilter',
] as const satisfies readonly Exclude<keyof AnimationFrame, 'position' | 'scale'>[]

export function applyAnimationTransaction(
  model: AnimationDocumentModel,
  transaction: AnimationTransaction,
): AnimationDocumentModel {
  switch (transaction.type) {
    case 'animation:update-frame': {
      const nextFrames = [...model.frames]
      const currentFrame = nextFrames[transaction.index]
      if (!currentFrame) {
        return model
      }

      nextFrames.splice(transaction.index, 1, markRaw({
        ...currentFrame,
        ...transaction.frame,
      }))
      return {
        ...model,
        frames: nextFrames,
      }
    }
    case 'animation:insert-frame': {
      const insertIndex = transaction.afterIndex === undefined
        ? 0
        : Math.min(transaction.afterIndex + 1, model.frames.length)
      const nextFrames = [...model.frames]
      nextFrames.splice(insertIndex, 0, markRaw(cloneAnimationFrame(transaction.frame)))
      return {
        ...model,
        frames: nextFrames,
      }
    }
    case 'animation:delete-frame': {
      return {
        ...model,
        frames: model.frames.filter((_frame, index) => index !== transaction.index),
      }
    }
    case 'animation:reorder-frame': {
      const nextFrames = [...model.frames]
      const movedFrame = nextFrames[transaction.fromIndex]
      if (!movedFrame) {
        return model
      }

      nextFrames.splice(transaction.fromIndex, 1)
      nextFrames.splice(transaction.toIndex, 0, movedFrame)
      return {
        ...model,
        frames: nextFrames,
      }
    }
    case 'animation:batch': {
      let nextModel = model
      for (const operation of transaction.operations) {
        nextModel = applyAnimationTransaction(nextModel, operation)
      }
      return nextModel
    }
    default: {
      return model
    }
  }
}

export function isAnimationFrameEqual(left: AnimationFrame, right: AnimationFrame): boolean {
  if (!isPoint2DEqual(left.position, right.position) || !isPoint2DEqual(left.scale, right.scale)) {
    return false
  }

  return animationFrameScalarKeys.every(key => left[key] === right[key])
}

function isPoint2DEqual(left: Point2D | undefined, right: Point2D | undefined): boolean {
  if (!left && !right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return left.x === right.x && left.y === right.y
}
