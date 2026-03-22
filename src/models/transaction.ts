import { AnimationFrame } from '~/types/stage'

import type { TextMetadata } from './document-model'
import type { SceneSelectionSnapshot } from './scene-selection'

// ============================================================
// 事务类型定义
// ============================================================

export interface EditorSelectionSnapshot {
  selectionStartOffset: number
  positionOffset: number
}

export interface EditorHistorySnapshot {
  selections: EditorSelectionSnapshot[]
  scrollTop: number
  scrollLeft: number
}

export interface SceneSelectionHistoryMetadata {
  before?: SceneSelectionSnapshot
  after?: SceneSelectionSnapshot
}

export interface EditorHistoryMetadata {
  before?: EditorHistorySnapshot
  after?: EditorHistorySnapshot
  sceneSelection?: SceneSelectionHistoryMetadata
}

// 场景文档事务
interface StatementUpdateTx { type: 'statement:update', id: number, rawText: string }
interface StatementInsertTx { type: 'statement:insert', id: number, afterId: number | null, rawText: string }
interface StatementDeleteTx { type: 'statement:delete', id: number }
interface StatementReorderTx { type: 'statement:reorder', fromIndex: number, toIndex: number }
export type SceneTransactionOperation =
  | StatementUpdateTx
  | StatementInsertTx
  | StatementDeleteTx
  | StatementReorderTx
interface StatementBatchTx { type: 'statement:batch', operations: SceneTransactionOperation[] }
export type SceneTransaction = SceneTransactionOperation | StatementBatchTx

// 动画文档事务
interface AnimationUpdateFrameTx { type: 'animation:update-frame', index: number, frame: Partial<AnimationFrame> }
interface AnimationInsertFrameTx { type: 'animation:insert-frame', afterIndex?: number, frame: AnimationFrame }
interface AnimationDeleteFrameTx { type: 'animation:delete-frame', index: number }
interface AnimationReorderFrameTx { type: 'animation:reorder-frame', fromIndex: number, toIndex: number }
export type AnimationTransactionOperation =
  | AnimationUpdateFrameTx
  | AnimationInsertFrameTx
  | AnimationDeleteFrameTx
  | AnimationReorderFrameTx
interface AnimationBatchTx { type: 'animation:batch', operations: AnimationTransactionOperation[] }
export type AnimationTransaction = AnimationTransactionOperation | AnimationBatchTx

// 文本事务（适用于所有 kind）
interface TextSetContentTx { type: 'text:set-content', resultContent: string }

// 通用事务
interface ReplaceAllTx { type: 'replace-all', content: string, metadata?: Partial<TextMetadata> }
export type TextTransaction = TextSetContentTx | ReplaceAllTx

export type Transaction =
  | SceneTransaction
  | AnimationTransaction
  | TextTransaction

export type TransactionSource = 'text' | 'visual' | 'effect-editor' | 'external'

export interface HistoryEntry {
  forward: Transaction
  inverse: Transaction
  timestamp: number
  source: TransactionSource
  editorMetadata?: EditorHistoryMetadata
}

// ============================================================
// EditHistory
// ============================================================

/** 合并窗口：300ms 内的连续同类事务合并为一个 undo 条目 */
const MERGE_WINDOW_MS = 300
/** 历史容量上限 */
const MAX_HISTORY = 100

export interface HistoryCommitResult {
  /** 事务是否成功应用 */
  applied: boolean
  /** 当前事务序号（单调递增） */
  sequenceNumber: number
}

/**
 * 编辑历史管理器：管理事务提交、undo/redo 历史。
 */
export class EditHistory {
  private _undoStack: HistoryEntry[] = []
  private _redoStack: HistoryEntry[] = []
  private _sequenceNumber = 0
  private _revisionNumber = 0
  private _mergeBarrier = false

  get undoStack(): readonly HistoryEntry[] {
    return this._undoStack
  }

  get redoStack(): readonly HistoryEntry[] {
    return this._redoStack
  }

  get sequenceNumber(): number {
    return this._sequenceNumber
  }

  get revisionNumber(): number {
    return this._revisionNumber
  }

  get canUndo(): boolean {
    return this._undoStack.length > 0
  }

  get canRedo(): boolean {
    return this._redoStack.length > 0
  }

  /**
   * 提交一个事务。
   * @param tx 要提交的事务
   * @param inverse 该事务的逆操作
   * @param source 事务来源
   * @param skipHistory 是否跳过历史记录（如 replace-all 外部变更）
   */
  commit(
    tx: Transaction,
    inverse: Transaction,
    source: TransactionSource,
    skipHistory = false,
    editorMetadata?: EditorHistoryMetadata,
  ): HistoryCommitResult {
    this._revisionNumber++

    if (!skipHistory) {
      const now = Date.now()
      const last = this._undoStack.at(-1)

      // 合并窗口：300ms 内的连续同类事务合并
      if (!this._mergeBarrier
        && last
        && last.source === source
        && now - last.timestamp < MERGE_WINDOW_MS
        && canMerge(last.forward, tx)) {
        // 合并：保留原始 inverse（undo 时回到合并前的状态），更新 forward
        last.forward = mergeTransactionForward(last.forward, tx)
        last.timestamp = now
        last.editorMetadata = mergeEditorHistoryMetadata(last.editorMetadata, editorMetadata)
      } else {
        this._undoStack.push({ forward: tx, inverse, timestamp: now, source, editorMetadata })
        this._sequenceNumber++
        // 超出容量时丢弃最早的条目
        if (this._undoStack.length > MAX_HISTORY) {
          this._undoStack.shift()
        }
      }

      // 新事务提交后清空 redo 栈
      this._redoStack = []
    }

    this._mergeBarrier = false

    return { applied: true, sequenceNumber: this._sequenceNumber }
  }

  /**
   * 撤销最近一次事务，返回需要执行的逆操作。
   * 调用方负责实际执行逆操作来修改状态。
   */
  undo(): HistoryEntry | undefined {
    const entry = this._undoStack.pop()
    if (entry) {
      this._redoStack.push(entry)
      this._sequenceNumber = Math.max(0, this._sequenceNumber - 1)
      this._revisionNumber++
      this._mergeBarrier = true
    }
    return entry
  }

  /**
   * 重做最近一次撤销的事务，返回需要执行的正向操作。
   */
  redo(): HistoryEntry | undefined {
    const entry = this._redoStack.pop()
    if (entry) {
      this._undoStack.push(entry)
      this._sequenceNumber++
      this._revisionNumber++
      this._mergeBarrier = true
    }
    return entry
  }

  markBoundary(): void {
    this._mergeBarrier = true
  }

  /** 清空所有历史 */
  reset(): void {
    this._undoStack = []
    this._redoStack = []
    this._sequenceNumber = 0
    this._revisionNumber = 0
    this._mergeBarrier = false
  }
}

// ============================================================
// 合并判定
// ============================================================

/** 判断两个事务是否可以合并（同类型、同目标） */
function canMerge(a: Transaction, b: Transaction): boolean {
  if (a.type !== b.type) {
    return false
  }

  switch (a.type) {
    case 'statement:update': {
      return (b as StatementUpdateTx).id === a.id
    }
    case 'text:set-content': {
      // 连续输入会不断覆盖为最新全文，因此在合并窗口内总是可合并
      return true
    }
    case 'replace-all': {
      return true
    }
    case 'animation:update-frame': {
      return (b as AnimationUpdateFrameTx).index === a.index
    }
    default: {
      return false
    }
  }
}

function mergeTransactionForward(current: Transaction, incoming: Transaction): Transaction {
  if (current.type !== incoming.type) {
    return incoming
  }

  switch (current.type) {
    case 'text:set-content': {
      const nextPatch = incoming as TextSetContentTx
      return {
        type: 'text:set-content',
        resultContent: nextPatch.resultContent,
      }
    }
    case 'animation:update-frame': {
      const nextFrameUpdate = incoming as AnimationUpdateFrameTx
      return {
        type: 'animation:update-frame',
        index: current.index,
        frame: {
          ...current.frame,
          ...nextFrameUpdate.frame,
        },
      }
    }
    default: {
      return incoming
    }
  }
}

function mergeEditorHistoryMetadata(
  current: EditorHistoryMetadata | undefined,
  incoming: EditorHistoryMetadata | undefined,
): EditorHistoryMetadata | undefined {
  if (!current) {
    return incoming
  }

  if (!incoming) {
    return current
  }

  return {
    before: current.before ?? incoming.before,
    after: incoming.after ?? current.after,
    sceneSelection: mergeSceneSelectionHistoryMetadata(
      current.sceneSelection,
      incoming.sceneSelection,
    ),
  }
}

function mergeSceneSelectionHistoryMetadata(
  current: SceneSelectionHistoryMetadata | undefined,
  incoming: SceneSelectionHistoryMetadata | undefined,
): SceneSelectionHistoryMetadata | undefined {
  if (!current) {
    return incoming
  }

  if (!incoming) {
    return current
  }

  return {
    before: current.before ?? incoming.before,
    after: incoming.after ?? current.after,
  }
}
