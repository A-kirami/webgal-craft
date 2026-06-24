import * as monaco from 'monaco-editor'
import { describe, expect, it, vi } from 'vitest'

import { resolveTextEditorCommandDropAction } from '~/features/editor/text-editor/text-editor-command-drop'

import type { CommandPanelStatementDragPayload } from '~/types/drag-drop'

vi.mock('monaco-editor', async () => {
  const { createMonacoMockModule } = await import('~/__tests__/mocks/monaco')
  return createMonacoMockModule()
})

function createPayload(rawTexts: string[]): CommandPanelStatementDragPayload {
  return {
    label: 'Say',
    rawTexts,
    source: 'command-panel',
    type: 'command-panel-statement',
  }
}

function createMouseTarget(lineNumber: number, column: number): monaco.editor.IMouseTargetContentText {
  const position = new monaco.Position(lineNumber, column)
  const range = new monaco.Range(lineNumber, column, lineNumber, column)
  return {
    detail: {
      mightBeForeignElement: false,
    },
    // Monaco 的 IMouseTarget 契约显式用 null 表示没有关联 DOM 元素。
    // eslint-disable-next-line unicorn/no-null
    element: null,
    mouseColumn: column,
    position,
    range,
    type: monaco.editor.MouseTargetType.CONTENT_TEXT,
  }
}

function createEditorDouble(lines: string[]) {
  const model = {
    getLineContent(lineNumber: number) {
      return lines[lineNumber - 1] ?? ''
    },
    getLineMaxColumn(lineNumber: number) {
      return (lines[lineNumber - 1] ?? '').length + 1
    },
  }

  return {
    getModel: () => model,
    getTargetAtClientPoint: vi.fn(() => createMouseTarget(2, 1)),
  } as unknown as monaco.editor.IStandaloneCodeEditor
}

describe('resolveTextEditorCommandDropAction', () => {
  it('空行投放命令会在空行位置插入语句', () => {
    const editor = createEditorDouble(['say:hello;', ''])

    const action = resolveTextEditorCommandDropAction({
      editor,
      payload: createPayload(['changeBg:room.png;']),
      position: { x: 100, y: 40 },
    })

    expect(action).toMatchObject({
      kind: 'insert-statement-line',
      text: 'changeBg:room.png;',
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 },
      selectionLineNumber: 2,
    })
  })

  it('非空行行首投放命令会插入到当前行之前', () => {
    const editor = createEditorDouble(['say:hello;', 'changeBg:old.png;'])
    editor.getTargetAtClientPoint = vi.fn(() => createMouseTarget(2, 1))

    const action = resolveTextEditorCommandDropAction({
      editor,
      payload: createPayload(['changeBg:room.png;']),
      position: { x: 20, y: 40 },
    })

    expect(action).toMatchObject({
      kind: 'insert-statement-line',
      text: 'changeBg:room.png;\n',
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 },
      selectionLineNumber: 2,
    })
  })

  it('语句主体中间投放命令会插入到当前行之后', () => {
    const editor = createEditorDouble(['say:hello;', 'say:world -speaker=Bob;'])
    editor.getTargetAtClientPoint = vi.fn(() => createMouseTarget(2, 10))

    const action = resolveTextEditorCommandDropAction({
      editor,
      payload: createPayload(['changeBg:room.png;']),
      position: { x: 120, y: 40 },
    })

    expect(action).toMatchObject({
      kind: 'insert-statement-line',
      text: '\nchangeBg:room.png;',
      range: { startLineNumber: 2, startColumn: 24, endLineNumber: 2, endColumn: 24 },
      selectionLineNumber: 3,
    })
  })

  it('语句组投放会按多行连续插入', () => {
    const editor = createEditorDouble(['say:hello;', 'say:world;'])
    editor.getTargetAtClientPoint = vi.fn(() => createMouseTarget(2, 5))

    const action = resolveTextEditorCommandDropAction({
      editor,
      payload: createPayload(['changeBg:room.png;', 'bgm:theme.ogg;']),
      position: { x: 120, y: 40 },
    })

    expect(action).toMatchObject({
      kind: 'insert-statement-line',
      text: '\nchangeBg:room.png;\nbgm:theme.ogg;',
      range: { startLineNumber: 2, startColumn: 11, endLineNumber: 2, endColumn: 11 },
      selectionLineNumber: 4,
    })
  })
})
