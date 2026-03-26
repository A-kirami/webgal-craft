import { describe, expect, it } from 'vitest'

import { EditHistory } from '../transaction'

import type { Transaction } from '../transaction'

function makeTx(_type: string, id = 0): Transaction {
  return { type: 'statement:update', id, rawText: `text-${id}` } as Transaction
}

function makeInverse(id = 0): Transaction {
  return { type: 'statement:update', id, rawText: `old-${id}` } as Transaction
}

describe('EditHistory 编辑历史', () => {
  it('初始状态：sequenceNumber 为 0，不可 undo/redo', () => {
    const engine = new EditHistory()
    expect(engine.sequenceNumber).toBe(0)
    expect(engine.canUndo).toBe(false)
    expect(engine.canRedo).toBe(false)
  })

  it('apply 后 sequenceNumber 递增，canUndo 为 true', () => {
    const engine = new EditHistory()
    const result = engine.commit(makeTx('statement:update'), makeInverse(), 'visual')
    expect(result.applied).toBe(true)
    expect(result.sequenceNumber).toBe(1)
    expect(engine.canUndo).toBe(true)
    expect(engine.canRedo).toBe(false)
  })

  it('undo 返回已提交的事务并移入 redo 栈', () => {
    const engine = new EditHistory()
    const tx = makeTx('statement:update', 1)
    const inv = makeInverse(1)
    engine.commit(tx, inv, 'visual')

    const entry = engine.undo()
    expect(entry).toBeDefined()
    expect(entry!.forward).toBe(tx)
    expect(entry!.inverse).toBe(inv)
    expect(engine.sequenceNumber).toBe(0)
    expect(engine.canUndo).toBe(false)
    expect(engine.canRedo).toBe(true)
  })

  it('redo 返回已撤销的事务并移回 undo 栈', () => {
    const engine = new EditHistory()
    engine.commit(makeTx('statement:update', 1), makeInverse(1), 'visual')
    engine.undo()

    const entry = engine.redo()
    expect(entry).toBeDefined()
    expect(engine.sequenceNumber).toBe(1)
    expect(engine.canUndo).toBe(true)
    expect(engine.canRedo).toBe(false)
  })

  it('新事务提交后清空 redo 栈', () => {
    const engine = new EditHistory()
    engine.commit(makeTx('statement:update', 1), makeInverse(1), 'visual')
    engine.undo()
    expect(engine.canRedo).toBe(true)

    engine.commit(makeTx('statement:update', 2), makeInverse(2), 'visual')
    expect(engine.canRedo).toBe(false)
  })

  it('undo 空栈返回 undefined', () => {
    const engine = new EditHistory()
    expect(engine.undo()).toBeUndefined()
  })

  it('redo 空栈返回 undefined', () => {
    const engine = new EditHistory()
    expect(engine.redo()).toBeUndefined()
  })

  it('reset 清空所有历史和序号', () => {
    const engine = new EditHistory()
    engine.commit(makeTx('statement:update'), makeInverse(), 'visual')
    engine.reset()
    expect(engine.sequenceNumber).toBe(0)
    expect(engine.canUndo).toBe(false)
    expect(engine.canRedo).toBe(false)
  })

  it('skipHistory 不记录到 undo 栈', () => {
    const engine = new EditHistory()
    engine.commit(makeTx('statement:update'), makeInverse(), 'visual', true)
    expect(engine.sequenceNumber).toBe(0)
    expect(engine.canUndo).toBe(false)
  })

  it('历史容量上限为 100，超出后丢弃最早条目', () => {
    const engine = new EditHistory()
    for (let i = 0; i < 110; i++) {
      engine.commit(
        { type: 'statement:insert', id: i + 1, afterId: i, rawText: `s${i}` } as Transaction,
        { type: 'statement:delete', id: i } as Transaction,
        'visual',
      )
    }
    expect(engine.undoStack.length).toBe(100)
  })

  describe('合并窗口', () => {
    it('300ms 内同 id 的 statement:update 合并为一个 undo 条目', () => {
      const engine = new EditHistory()
      const inv1 = makeInverse(1)
      engine.commit(
        { type: 'statement:update', id: 1, rawText: 'a' } as Transaction,
        inv1,
        'visual',
      )
      // 立即再次提交同 id（在 300ms 窗口内）
      engine.commit(
        { type: 'statement:update', id: 1, rawText: 'ab' } as Transaction,
        makeInverse(1),
        'visual',
      )
      expect(engine.undoStack.length).toBe(1)
      expect(engine.sequenceNumber).toBe(1)
      // 合并后 forward 是最新的，inverse 保留原始的
      expect((engine.undoStack[0].forward as { rawText: string }).rawText).toBe('ab')
      expect(engine.undoStack[0].inverse).toBe(inv1)
    })

    it('不同 id 的 statement:update 不合并', () => {
      const engine = new EditHistory()
      engine.commit(
        { type: 'statement:update', id: 1, rawText: 'a' } as Transaction,
        makeInverse(1),
        'visual',
      )
      engine.commit(
        { type: 'statement:update', id: 2, rawText: 'b' } as Transaction,
        makeInverse(2),
        'visual',
      )
      expect(engine.undoStack.length).toBe(2)
    })

    it('不同类型的事务不合并', () => {
      const engine = new EditHistory()
      engine.commit(
        { type: 'statement:update', id: 1, rawText: 'a' } as Transaction,
        makeInverse(1),
        'visual',
      )
      engine.commit(
        { type: 'statement:insert', id: 2, afterId: 1, rawText: 'b' } as Transaction,
        { type: 'statement:delete', id: 2 } as Transaction,
        'visual',
      )
      expect(engine.undoStack.length).toBe(2)
    })

    it('text:set-content 在窗口内总是可合并', () => {
      const engine = new EditHistory()
      const patch1 = { type: 'text:set-content', resultContent: 'a' } as Transaction
      const patch2 = { type: 'text:set-content', resultContent: 'ab' } as Transaction
      engine.commit(patch1, { type: 'text:set-content', resultContent: '' } as Transaction, 'text')
      engine.commit(patch2, { type: 'text:set-content', resultContent: '' } as Transaction, 'text')
      expect(engine.undoStack.length).toBe(1)
      expect(engine.undoStack[0].forward).toEqual({
        type: 'text:set-content',
        resultContent: 'ab',
      })
    })

    it('replace-all 在窗口内保留最新 forward 与最早 inverse', () => {
      const engine = new EditHistory()

      engine.commit(
        { type: 'replace-all', content: 'a' },
        { type: 'replace-all', content: '' },
        'text',
      )
      engine.commit(
        { type: 'replace-all', content: 'ab' },
        { type: 'replace-all', content: 'a' },
        'text',
      )

      expect(engine.undoStack.length).toBe(1)
      expect(engine.sequenceNumber).toBe(1)
      expect(engine.undoStack[0].forward).toEqual({ type: 'replace-all', content: 'ab' })
      expect(engine.undoStack[0].inverse).toEqual({ type: 'replace-all', content: '' })
    })

    it('合并文本历史时保留最早 before 和最新 after 光标元数据', () => {
      const engine = new EditHistory()

      engine.commit(
        { type: 'replace-all', content: 'a' },
        { type: 'replace-all', content: '' },
        'text',
        false,
        {
          before: {
            selections: [{ selectionStartOffset: 0, positionOffset: 0 }],
            scrollTop: 0,
            scrollLeft: 0,
          },
          after: {
            selections: [{ selectionStartOffset: 1, positionOffset: 1 }],
            scrollTop: 10,
            scrollLeft: 0,
          },
          sceneSelection: {
            before: {
              selectedStatementId: 1,
              lastEditedStatementId: 1,
              lastLineNumber: 1,
            },
            after: {
              selectedStatementId: 1,
              lastEditedStatementId: 1,
              lastLineNumber: 1,
            },
          },
        },
      )

      engine.commit(
        { type: 'replace-all', content: 'ab' },
        { type: 'replace-all', content: 'a' },
        'text',
        false,
        {
          before: {
            selections: [{ selectionStartOffset: 1, positionOffset: 1 }],
            scrollTop: 20,
            scrollLeft: 0,
          },
          after: {
            selections: [{ selectionStartOffset: 2, positionOffset: 2 }],
            scrollTop: 30,
            scrollLeft: 0,
          },
          sceneSelection: {
            before: {
              selectedStatementId: 2,
              lastEditedStatementId: 2,
              lastLineNumber: 2,
            },
            after: {
              selectedStatementId: 2,
              lastEditedStatementId: 2,
              lastLineNumber: 2,
            },
          },
        },
      )

      expect(engine.undoStack[0].editorMetadata?.before?.selections[0]?.positionOffset).toBe(0)
      expect(engine.undoStack[0].editorMetadata?.after?.selections[0]?.positionOffset).toBe(2)
      expect(engine.undoStack[0].editorMetadata?.after?.scrollTop).toBe(30)
      expect(engine.undoStack[0].editorMetadata?.sceneSelection?.before?.selectedStatementId).toBe(1)
      expect(engine.undoStack[0].editorMetadata?.sceneSelection?.after?.selectedStatementId).toBe(2)
    })

    it('markBoundary 后的新事务不会与保存前条目合并', () => {
      const engine = new EditHistory()
      const patch1 = { type: 'text:set-content', resultContent: 'a' } as Transaction
      const patch2 = { type: 'text:set-content', resultContent: 'ab' } as Transaction

      engine.commit(patch1, { type: 'text:set-content', resultContent: '' } as Transaction, 'text')
      engine.markBoundary()
      engine.commit(patch2, { type: 'text:set-content', resultContent: '' } as Transaction, 'text')

      expect(engine.undoStack.length).toBe(2)
      expect(engine.sequenceNumber).toBe(2)
    })

    it('animation:update-frame 在窗口内合并 partial frame', () => {
      const engine = new EditHistory()
      engine.commit(
        { type: 'animation:update-frame', index: 0, frame: { duration: 100 } },
        { type: 'replace-all', content: '' },
        'visual',
      )
      engine.commit(
        { type: 'animation:update-frame', index: 0, frame: { ease: 'linear' } },
        { type: 'replace-all', content: '' },
        'visual',
      )

      expect(engine.undoStack).toHaveLength(1)
      expect(engine.undoStack[0].forward).toEqual({
        type: 'animation:update-frame',
        index: 0,
        frame: { duration: 100, ease: 'linear' },
      })
    })
  })

  it('多次 undo/redo 循环保持一致性', () => {
    const engine = new EditHistory()
    for (let i = 0; i < 5; i++) {
      engine.commit(
        { type: 'statement:insert', id: i + 1, afterId: i, rawText: `s${i}` } as Transaction,
        { type: 'statement:delete', id: i } as Transaction,
        'visual',
      )
    }
    // undo 全部
    for (let i = 0; i < 5; i++) {
      expect(engine.undo()).toBeDefined()
    }
    expect(engine.canUndo).toBe(false)
    expect(engine.canRedo).toBe(true)

    // redo 全部
    for (let i = 0; i < 5; i++) {
      expect(engine.redo()).toBeDefined()
    }
    expect(engine.canUndo).toBe(true)
    expect(engine.canRedo).toBe(false)
  })
})
