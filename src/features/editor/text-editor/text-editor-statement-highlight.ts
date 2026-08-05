import { buildStatementSourceRanges } from '~/domain/script/sentence'

import type { StatementSourceRange } from '~/domain/script/sentence'

export const LOGICAL_STATEMENT_HIGHLIGHT_CLASS_NAME = 'logical-statement-highlight'

export interface TextEditorStatementHighlightModel {
  getLineContent: (lineNumber: number) => string
  getLineCount: () => number
  getVersionId: () => number
}

export interface TextEditorStatementHighlightDecoration {
  range: {
    endColumn: number
    endLineNumber: number
    startColumn: number
    startLineNumber: number
  }
  options: {
    className: string
    isWholeLine: boolean
  }
}

export interface TextEditorStatementHighlightDecorationsCollection {
  clear: () => void
  set: (newDecorations: readonly TextEditorStatementHighlightDecoration[]) => string[]
}

export interface TextEditorStatementHighlightEditor {
  createDecorationsCollection: () => TextEditorStatementHighlightDecorationsCollection
  getModel: () => TextEditorStatementHighlightModel | null | undefined
  getPosition: () => { lineNumber: number } | null | undefined
}

interface CreateTextEditorStatementHighlightControllerOptions {
  editor: TextEditorStatementHighlightEditor
  isEnabled: () => boolean
}

function createStatementHighlightDecoration(
  startLine: number,
  endLine: number,
): TextEditorStatementHighlightDecoration {
  return {
    range: {
      endColumn: 1,
      endLineNumber: endLine + 1,
      startColumn: 1,
      startLineNumber: startLine + 1,
    },
    options: {
      className: LOGICAL_STATEMENT_HIGHLIGHT_CLASS_NAME,
      isWholeLine: true,
    },
  }
}

function readModelText(model: TextEditorStatementHighlightModel): string {
  return Array.from(
    { length: model.getLineCount() },
    (_, index) => model.getLineContent(index + 1),
  ).join('\n')
}

/**
 * 将当前光标所在的多行逻辑语句作为整体高亮。
 * 单行语句继续使用 Monaco 内置的当前行高亮，避免重复 decoration。
 */
export function createTextEditorStatementHighlightController(
  options: CreateTextEditorStatementHighlightControllerOptions,
) {
  const decorations = options.editor.createDecorationsCollection()
  let hasStatementHighlight = false
  let sourceRanges: StatementSourceRange[] = []
  let sourceRangesModel: TextEditorStatementHighlightModel | undefined
  let sourceRangesVersion: number | undefined

  function getStatementSourceRanges(model: TextEditorStatementHighlightModel): StatementSourceRange[] {
    const version = model.getVersionId()
    if (sourceRangesModel !== model || sourceRangesVersion !== version) {
      sourceRanges = buildStatementSourceRanges(readModelText(model))
      sourceRangesModel = model
      sourceRangesVersion = version
    }

    return sourceRanges
  }

  function clearDecorations() {
    if (!hasStatementHighlight) {
      return
    }

    hasStatementHighlight = false
    decorations.clear()
  }

  function syncDecorationsForLine(lineNumber: number | undefined) {
    if (!options.isEnabled() || !lineNumber) {
      clearDecorations()
      return
    }

    const model = options.editor.getModel()
    if (!model) {
      clearDecorations()
      return
    }

    const range = getStatementSourceRanges(model)
      .find(item => lineNumber - 1 >= item.startLine && lineNumber - 1 <= item.endLine)
    if (!range || range.startLine === range.endLine) {
      clearDecorations()
      return
    }

    decorations.set([
      createStatementHighlightDecoration(range.startLine, range.endLine),
    ])
    hasStatementHighlight = true
  }

  function syncFromEditorPosition() {
    syncDecorationsForLine(options.editor.getPosition()?.lineNumber)
  }

  function dispose() {
    clearDecorations()
  }

  return {
    dispose,
    syncDecorationsForLine,
    syncFromEditorPosition,
  }
}
