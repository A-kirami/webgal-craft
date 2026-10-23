import type { FlowchartDocument } from './model'

const MAX_HISTORY = 100

/**
 * 流程图编辑会话的撤销/重做栈。
 *
 * 每项保存"提交前的完整文档"：命令本身是纯函数，快照式历史让撤销不依赖逆操作的正确性，
 * 也不会因为后续命令调整字段而失效。历史只存在于当前编辑会话，不写入 `flowchart.json`。
 */
export interface FlowchartHistory {
  redoStack: readonly FlowchartDocument[]
  undoStack: readonly FlowchartDocument[]
}

export interface FlowchartHistoryStep {
  document: FlowchartDocument
  history: FlowchartHistory
}

export function createFlowchartHistory(): FlowchartHistory {
  return { redoStack: [], undoStack: [] }
}

/** 提交一次可撤销变更：把变更前文档压入撤销栈，并清空重做栈 */
export function recordFlowchartChange(
  history: FlowchartHistory,
  previous: FlowchartDocument,
): FlowchartHistory {
  const undoStack = [...history.undoStack, previous]
  return {
    redoStack: [],
    undoStack: undoStack.length > MAX_HISTORY ? undoStack.slice(undoStack.length - MAX_HISTORY) : undoStack,
  }
}

export function undoFlowchartChange(
  history: FlowchartHistory,
  current: FlowchartDocument,
): FlowchartHistoryStep | undefined {
  const previous = history.undoStack.at(-1)
  if (!previous) {
    return undefined
  }

  return {
    document: previous,
    history: {
      redoStack: [...history.redoStack, current],
      undoStack: history.undoStack.slice(0, -1),
    },
  }
}

export function redoFlowchartChange(
  history: FlowchartHistory,
  current: FlowchartDocument,
): FlowchartHistoryStep | undefined {
  const next = history.redoStack.at(-1)
  if (!next) {
    return undefined
  }

  return {
    document: next,
    history: {
      redoStack: history.redoStack.slice(0, -1),
      undoStack: [...history.undoStack, current],
    },
  }
}
