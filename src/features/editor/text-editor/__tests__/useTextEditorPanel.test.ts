import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { AbsPath } from '~/domain/path'
import { useTextEditorPanel } from '~/features/editor/text-editor/useTextEditorPanel'

import type * as monaco from 'monaco-editor'

const getSceneSelectionMock = vi.fn()

vi.mock('~/stores/editor', () => ({
  useEditorStore: () => ({
    getSceneSelection: getSceneSelectionMock,
  }),
}))

function createModel(initialLines: string[]) {
  const lines = [...initialLines]

  return {
    getLineCount() {
      return lines.length
    },
    getLineContent(lineNumber: number) {
      return lines[lineNumber - 1] ?? ''
    },
    pushEditOperations: vi.fn((_selections, edits: monaco.editor.IIdentifiedSingleEditOperation[]) => {
      for (const edit of edits) {
        lines.splice(
          edit.range.startLineNumber - 1,
          edit.range.endLineNumber - edit.range.startLineNumber + 1,
          ...(edit.text ?? '').split('\n'),
        )
      }
      return []
    }),
  }
}

function createEditor(model: ReturnType<typeof createModel>) {
  return {
    getModel: () => model,
    getPosition: () => ({ lineNumber: 1, column: 1 }),
    getSelections: () => [],
  } as unknown as monaco.editor.IStandaloneCodeEditor
}

describe('useTextEditorPanel', () => {
  beforeEach(() => {
    getSceneSelectionMock.mockReset()
    getSceneSelectionMock.mockReturnValue(undefined)
  })

  it('在侧栏表单真正回写文本前捕获历史前态', () => {
    const model = createModel(['Alice:Hello;'])
    const captureBeforeContentChange = vi.fn()
    const panel = useTextEditorPanel({
      captureBeforeContentChange,
      editorRef: ref(createEditor(model)),
      getPath: () => AbsPath.from('/game/scene/example.txt'),
    })

    const handled = panel.handleFormUpdate({
      parsed: {} as never,
      rawText: 'Alice:Updated;',
      target: {
        endLineNumber: 1,
        kind: 'line',
        lineNumber: 1,
      },
    })

    expect(handled).toBe(true)
    expect(captureBeforeContentChange).toHaveBeenCalledTimes(1)
    expect(model.pushEditOperations).toHaveBeenCalledTimes(1)
  })

  it('空操作不会留下历史前态快照', () => {
    const model = createModel(['Alice:Hello;'])
    const captureBeforeContentChange = vi.fn()
    const panel = useTextEditorPanel({
      captureBeforeContentChange,
      editorRef: ref(createEditor(model)),
      getPath: () => AbsPath.from('/game/scene/example.txt'),
    })

    const handled = panel.handleFormUpdate({
      parsed: {} as never,
      rawText: 'Alice:Hello;',
      target: {
        endLineNumber: 1,
        kind: 'line',
        lineNumber: 1,
      },
    })

    expect(handled).toBe(false)
    expect(captureBeforeContentChange).not.toHaveBeenCalled()
    expect(model.pushEditOperations).not.toHaveBeenCalled()
  })

  it('按逻辑语句覆盖多行范围', () => {
    const model = createModel([
      'changeFigure:hero.png',
      '  -id=hero -left;',
      'say:next;',
    ])
    const panel = useTextEditorPanel({
      editorRef: ref(createEditor(model)),
      getPath: () => AbsPath.from('/game/scene/example.txt'),
    })

    const handled = panel.handleFormUpdate({
      parsed: {} as never,
      rawText: 'changeFigure:hero.png -id=hero -right;',
      target: {
        endLineNumber: 2,
        kind: 'line',
        lineNumber: 1,
      },
    })

    expect(handled).toBe(true)
    expect(model.getLineCount()).toBe(2)
    expect(model.getLineContent(1)).toBe('changeFigure:hero.png -id=hero -right;')
    expect(model.getLineContent(2)).toBe('say:next;')
  })
})
