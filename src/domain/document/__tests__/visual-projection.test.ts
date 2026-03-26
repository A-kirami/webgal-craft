import { describe, expect, it } from 'vitest'

import { applyAnimationTransaction, applySceneTransaction } from '../transaction-apply'
import { projectAnimationFrames, projectSceneStatements } from '../visual-projection'

import type { SceneDocumentModel } from '../document-model'
import type { StatementEntry } from '~/domain/script/sentence'
import type { AnimationFrame } from '~/domain/stage/types'

function createStatement(id: number, rawText: string): StatementEntry {
  return {
    id,
    rawText,
    parsed: undefined,
    parseError: false,
  }
}

function createSceneModel(statements: StatementEntry[]): SceneDocumentModel {
  return {
    kind: 'scene',
    statements,
    // eslint-disable-next-line unicorn/text-encoding-identifier-case -- 文档编码元数据沿用项目既有命名
    metadata: { lineEnding: '\n', encoding: 'utf-8' },
  }
}

function createAnimationModel(frames: AnimationFrame[]) {
  return {
    kind: 'animation' as const,
    frames,
    // eslint-disable-next-line unicorn/text-encoding-identifier-case -- 文档编码元数据沿用项目既有命名
    metadata: { lineEnding: '\n' as const, encoding: 'utf-8' as const },
  }
}

describe('可视化投影', () => {
  it('projectSceneStatements 会复用未变更语句并替换已变更语句', () => {
    const previousEntries = [
      createStatement(1, 'say:hello;'),
      createStatement(2, 'say:world;'),
    ]

    const projectedEntries = projectSceneStatements(createSceneModel([
      createStatement(1, 'say:hello;'),
      createStatement(2, 'say:world!!!;'),
    ]), previousEntries)

    expect(projectedEntries[0]).toBe(previousEntries[0])
    expect(projectedEntries[1]).not.toBe(previousEntries[1])
  })

  it('applySceneTransaction 支持 update / insert / delete / reorder / batch', () => {
    const initialModel = createSceneModel([
      createStatement(1, 'a'),
      createStatement(2, 'b'),
    ])

    const updatedModel = applySceneTransaction(initialModel, {
      type: 'statement:batch',
      operations: [
        { type: 'statement:update', id: 2, rawText: 'b2' },
        { type: 'statement:insert', id: 3, afterId: 2, rawText: 'c' },
        { type: 'statement:reorder', fromIndex: 2, toIndex: 0 },
        { type: 'statement:delete', id: 1 },
      ],
    })

    expect(updatedModel.statements.map(statement => statement.id)).toEqual([3, 2])
    expect(updatedModel.statements.map(statement => statement.rawText)).toEqual(['c', 'b2'])
  })

  it('applySceneTransaction 的 statement:update 仅替换目标语句引用', () => {
    const firstStatement = createStatement(1, 'a')
    const secondStatement = createStatement(2, 'b')
    const initialModel = createSceneModel([firstStatement, secondStatement])

    const updatedModel = applySceneTransaction(initialModel, {
      type: 'statement:update',
      id: 2,
      rawText: 'b2',
    })

    expect(updatedModel.statements[0]).toBe(firstStatement)
    expect(updatedModel.statements[1]).not.toBe(secondStatement)
    expect(updatedModel.statements[1]?.rawText).toBe('b2')
  })

  it('animation projection 复用未变更帧并支持增删改排', () => {
    const previousFrames = [{ duration: 100 }, { duration: 200, ease: 'linear' }]
    const projectedFrames = projectAnimationFrames(createAnimationModel([
      { duration: 100 },
      { duration: 300, ease: 'easeInOut' },
    ]), previousFrames)

    expect(projectedFrames[0]).toBe(previousFrames[0])
    expect(projectedFrames[1]).not.toBe(previousFrames[1])

    const updatedModel = applyAnimationTransaction(createAnimationModel([{ duration: 100 }]), {
      type: 'animation:batch',
      operations: [
        { type: 'animation:update-frame', index: 0, frame: { ease: 'linear' } },
        { type: 'animation:insert-frame', afterIndex: 0, frame: { duration: 200 } },
        { type: 'animation:reorder-frame', fromIndex: 1, toIndex: 0 },
      ],
    })

    expect(updatedModel.frames).toEqual([
      { duration: 200 },
      { duration: 100, ease: 'linear' },
    ])
  })

  it('animation projection 会把字段顺序不同但值相同的帧视为同一帧', () => {
    const previousFrame = {
      duration: 200,
      ease: 'linear',
      position: {
        x: 10,
        y: 20,
      },
      scale: {
        x: 1,
        y: 1,
      },
      alpha: 0.5,
    } satisfies AnimationFrame

    const projectedFrames = projectAnimationFrames(createAnimationModel([
      {
        alpha: 0.5,
        scale: {
          y: 1,
          x: 1,
        },
        position: {
          y: 20,
          x: 10,
        },
        ease: 'linear',
        duration: 200,
      },
    ]), [previousFrame])

    expect(projectedFrames[0]).toBe(previousFrame)
  })
})
