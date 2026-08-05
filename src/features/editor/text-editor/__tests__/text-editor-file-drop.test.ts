import * as monaco from 'monaco-editor'
import { describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import { resolveTextEditorFileDropAction } from '~/features/editor/text-editor/text-editor-file-drop'

import type { FileSystemDragPayload } from '~/types/drag-drop'

vi.mock('monaco-editor', async () => {
  const { createMonacoMockModule } = await import('~/__tests__/mocks/monaco')
  return createMonacoMockModule()
})

function createPayload(path: string): FileSystemDragPayload {
  return {
    source: 'file-viewer',
    type: 'file-system-item',
    path,
    isDir: false,
    name: path.split('/').at(-1),
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

function createEmptyMouseTarget(lineNumber: number, column: number): monaco.editor.IMouseTargetContentEmpty {
  const position = new monaco.Position(lineNumber, column)
  const range = new monaco.Range(lineNumber, column, lineNumber, column)
  return {
    detail: {
      isAfterLines: false,
    },
    // Monaco 的 IMouseTarget 契约显式用 null 表示没有关联 DOM 元素。
    // eslint-disable-next-line unicorn/no-null
    element: null,
    mouseColumn: column,
    position,
    range,
    type: monaco.editor.MouseTargetType.CONTENT_EMPTY,
  }
}

function createEditorDouble(lines: string[]) {
  const model = {
    getLineContent(lineNumber: number) {
      return lines[lineNumber - 1] ?? ''
    },
    getLineCount() {
      return lines.length
    },
    getLineMaxColumn(lineNumber: number) {
      return (lines[lineNumber - 1] ?? '').length + 1
    },
  }

  return {
    getModel: () => model,
    getSelections: () => [{ startLineNumber: 2, endLineNumber: 2 }],
    getTargetAtClientPoint: vi.fn(() => createMouseTarget(2, 1)),
  } as unknown as monaco.editor.IStandaloneCodeEditor
}

describe('text-editor-file-drop', () => {
  it('空行投放 background 会生成完整语句行插入动作', () => {
    const editor = createEditorDouble(['say:hello;', ''])

    const action = resolveTextEditorFileDropAction({
      editor,
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/background/room.png'),
      position: { x: 100, y: 40 },
    })

    expect(action).toMatchObject({
      kind: 'insert-statement-line',
      text: 'changeBg:room.png;',
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 },
      selectionLineNumber: 2,
    })
  })

  it('非空行行首投放 background 会生成上一行插入动作', () => {
    const editor = createEditorDouble(['say:hello;', 'changeBg:old.png;'])
    editor.getTargetAtClientPoint = vi.fn(() => createMouseTarget(2, 1))

    const action = resolveTextEditorFileDropAction({
      editor,
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/background/room.png'),
      position: { x: 20, y: 40 },
    })

    expect(action).toMatchObject({
      kind: 'insert-statement-line',
      text: 'changeBg:room.png;\n',
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 },
      selectionLineNumber: 2,
    })
  })

  it('兼容的 say 行投放 vocal 会生成语句更新动作', () => {
    const editor = createEditorDouble(['say:hello;', 'say:world -speaker=Bob;'])
    editor.getTargetAtClientPoint = vi.fn(() => createMouseTarget(2, 10))

    const action = resolveTextEditorFileDropAction({
      editor,
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/vocal/line-2.ogg'),
      position: { x: 80, y: 40 },
    })

    expect(action).toMatchObject({
      kind: 'update-statement',
      caretRange: { startLineNumber: 2, startColumn: 10, endLineNumber: 2, endColumn: 10 },
      selectionLineNumber: 2,
      payload: {
        rawText: 'say:world -speaker=Bob -line-2.ogg;',
      },
    })
  })

  it('非兼容行会退化为资源目录内路径插入', () => {
    const editor = createEditorDouble(['say:hello;', 'say:world;'])
    editor.getTargetAtClientPoint = vi.fn(() => createMouseTarget(2, 5))

    const action = resolveTextEditorFileDropAction({
      editor,
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/background/room.png'),
      position: { x: 80, y: 40 },
    })

    expect(action).toMatchObject({
      kind: 'insert-text',
      text: 'room.png',
      range: { startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 5 },
      selectionLineNumber: 2,
    })
  })

  it('续行内投放兼容资源会更新完整逻辑语句', () => {
    const editor = createEditorDouble([
      'say:world',
      '  -speaker=Bob;',
    ])
    editor.getTargetAtClientPoint = vi.fn(() => createMouseTarget(2, 10))

    const action = resolveTextEditorFileDropAction({
      editor,
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/vocal/line.ogg'),
      position: { x: 80, y: 40 },
    })

    expect(action).toMatchObject({
      kind: 'update-statement',
      payload: {
        target: {
          kind: 'line',
          lineNumber: 1,
          endLineNumber: 2,
        },
        rawText: 'say:world -speaker=Bob -line.ogg;',
      },
      selectionLineNumber: 1,
    })
  })

  it('多行语句首行内部投放会更新完整逻辑语句', () => {
    const editor = createEditorDouble([
      'say:world',
      '  -speaker=Bob;',
    ])
    editor.getTargetAtClientPoint = vi.fn(() => createMouseTarget(1, 5))

    const action = resolveTextEditorFileDropAction({
      editor,
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/vocal/line.ogg'),
      position: { x: 40, y: 20 },
    })

    expect(action).toMatchObject({
      kind: 'update-statement',
      payload: {
        target: {
          kind: 'line',
          lineNumber: 1,
          endLineNumber: 2,
        },
        rawText: 'say:world -speaker=Bob -line.ogg;',
      },
      selectionLineNumber: 1,
    })
  })

  it('内容空白区命中仍会按 Monaco 返回位置生成插入动作', () => {
    const editor = createEditorDouble(['say:hello;', 'plain text'])
    editor.getTargetAtClientPoint = vi.fn(() => createEmptyMouseTarget(2, 11))

    const action = resolveTextEditorFileDropAction({
      editor,
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/background/room.png'),
      position: { x: 240, y: 40 },
    })

    expect(action).toMatchObject({
      kind: 'insert-text',
      range: { startLineNumber: 2, startColumn: 11, endLineNumber: 2, endColumn: 11 },
      selectionLineNumber: 2,
    })
  })

  it('scene 非 txt 会被拒绝，不产生 drop action', () => {
    const editor = createEditorDouble(['', ''])
    const action = resolveTextEditorFileDropAction({
      editor,
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/scene/chapter2.json'),
      position: { x: 40, y: 20 },
    })

    expect(action).toBeUndefined()
  })

  it('animationTable.json 不会在文本编辑器中产生 drop action', () => {
    const editor = createEditorDouble(['', ''])
    const action = resolveTextEditorFileDropAction({
      editor,
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/animation/animationTable.json'),
      position: { x: 40, y: 20 },
    })

    expect(action).toBeUndefined()
  })
})
