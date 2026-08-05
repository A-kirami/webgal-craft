import { describe, expect, it, vi } from 'vitest'

import {
  createTextEditorStatementHighlightController,
  LOGICAL_STATEMENT_HIGHLIGHT_CLASS_NAME,
} from '~/features/editor/text-editor/text-editor-statement-highlight'

function createModel(lines: string[]) {
  return {
    getLineContent(lineNumber: number) {
      return lines[lineNumber - 1] ?? ''
    },
    getLineCount() {
      return lines.length
    },
    getVersionId() {
      return 1
    },
  }
}

function createDecorationsCollectionMock() {
  return {
    clear: vi.fn(),
    set: vi.fn((decorations: readonly unknown[]) =>
      decorations.map((_, index) => `statement-${index + 1}`),
    ),
  }
}

describe('createTextEditorStatementHighlightController', () => {
  it('光标位于续行时高亮完整逻辑语句', () => {
    const decorations = createDecorationsCollectionMock()
    const controller = createTextEditorStatementHighlightController({
      editor: {
        createDecorationsCollection: () => decorations,
        getModel: () => createModel([
          'changeBg:bg.webp;',
          'changeFigure:stand.webp',
          '  -transform={"position":{"x":-154}};',
          'say:xxxx;',
        ]),
        getPosition: () => ({ lineNumber: 3 }),
      },
      isEnabled: () => true,
    })

    controller.syncFromEditorPosition()

    expect(decorations.set).toHaveBeenCalledWith([
      {
        range: {
          endColumn: 1,
          endLineNumber: 3,
          startColumn: 1,
          startLineNumber: 2,
        },
        options: {
          className: LOGICAL_STATEMENT_HIGHLIGHT_CLASS_NAME,
          isWholeLine: true,
        },
      },
    ])
  })

  it('光标离开多行语句时移除高亮', () => {
    const decorations = createDecorationsCollectionMock()
    const controller = createTextEditorStatementHighlightController({
      editor: {
        createDecorationsCollection: () => decorations,
        getModel: () => createModel([
          'changeFigure:stand.webp',
          '  -id=hero;',
          'say:xxxx;',
        ]),
        getPosition: () => ({ lineNumber: 2 }),
      },
      isEnabled: () => true,
    })

    controller.syncFromEditorPosition()
    controller.syncDecorationsForLine(3)

    expect(decorations.clear).toHaveBeenCalledTimes(1)
  })

  it('单行语句不添加重复高亮', () => {
    const decorations = createDecorationsCollectionMock()
    const controller = createTextEditorStatementHighlightController({
      editor: {
        createDecorationsCollection: () => decorations,
        getModel: () => createModel(['say:xxxx;']),
        getPosition: () => ({ lineNumber: 1 }),
      },
      isEnabled: () => true,
    })

    controller.syncFromEditorPosition()

    expect(decorations.set).not.toHaveBeenCalled()
  })
})
