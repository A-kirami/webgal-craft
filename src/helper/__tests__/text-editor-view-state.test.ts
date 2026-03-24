import '~/__tests__/setup'

import { describe, expect, it } from 'vitest'

import { normalizeEditorViewState } from '~/helper/text-editor-view-state'

import type * as monaco from 'monaco-editor'

function createViewState(): monaco.editor.ICodeEditorViewState {
  return {
    cursorState: [{
      inSelectionMode: false,
      selectionStart: { lineNumber: 3, column: 1 },
      position: { lineNumber: 3, column: 8 },
    }],
    viewState: {
      scrollLeft: 12,
      scrollTop: 34,
      firstPosition: { lineNumber: 2, column: 1 },
      firstPositionDeltaTop: 5,
    },
    contributionsState: {},
  } as monaco.editor.ICodeEditorViewState
}

function createSelection(
  selectionStartLineNumber: number,
  selectionStartColumn: number,
  positionLineNumber: number,
  positionColumn: number,
): monaco.Selection {
  return {
    selectionStartLineNumber,
    selectionStartColumn,
    positionLineNumber,
    positionColumn,
  } as monaco.Selection
}

describe('normalizeEditorViewState', () => {
  it('使用当前编辑器选区作为持久化光标状态', () => {
    const viewState = createViewState()
    const normalized = normalizeEditorViewState(viewState, [
      createSelection(5, 4, 5, 4),
    ])

    expect(normalized).toEqual({
      ...viewState,
      cursorState: [{
        inSelectionMode: false,
        selectionStart: { lineNumber: 5, column: 4 },
        position: { lineNumber: 5, column: 4 },
      }],
    })
  })

  it('根据实时选区形态重新计算选择模式', () => {
    const viewState = createViewState()
    viewState.cursorState[0].inSelectionMode = true

    expect(normalizeEditorViewState(viewState, [
      createSelection(5, 4, 5, 4),
    ])?.cursorState[0]?.inSelectionMode).toBe(false)

    expect(normalizeEditorViewState(viewState, [
      createSelection(5, 4, 5, 9),
    ])?.cursorState[0]?.inSelectionMode).toBe(true)
  })

  it('在选区不可用时保留原始视图状态', () => {
    const viewState = createViewState()

    expect(normalizeEditorViewState(viewState, undefined)).toEqual(viewState)
    expect(normalizeEditorViewState(viewState, [])).toEqual(viewState)
  })
})
