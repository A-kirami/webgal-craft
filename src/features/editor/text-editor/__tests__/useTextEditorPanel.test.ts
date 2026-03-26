import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

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
        lines[edit.range.startLineNumber - 1] = edit.text ?? ''
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

describe('useTextEditorPanel 行为', () => {
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
      getPath: () => '/game/scene/example.txt',
    })

    const handled = panel.handleFormUpdate({
      parsed: {} as never,
      rawText: 'Alice:Updated;',
      target: {
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
      getPath: () => '/game/scene/example.txt',
    })

    const handled = panel.handleFormUpdate({
      parsed: {} as never,
      rawText: 'Alice:Hello;',
      target: {
        kind: 'line',
        lineNumber: 1,
      },
    })

    expect(handled).toBe(false)
    expect(captureBeforeContentChange).not.toHaveBeenCalled()
    expect(model.pushEditOperations).not.toHaveBeenCalled()
  })
})
