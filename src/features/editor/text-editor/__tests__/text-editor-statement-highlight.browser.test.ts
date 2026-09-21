import * as monaco from 'monaco-editor'
import { describe, expect, it } from 'vitest'

import { createTextEditorStatementHighlightController } from '~/features/editor/text-editor/text-editor-statement-highlight'

function nextFrames(count = 3) {
  return new Promise<void>((resolve) => {
    let remaining = count
    function tick() {
      remaining -= 1
      if (remaining <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

describe('createTextEditorStatementHighlightController', () => {
  it('出现非空选区时清除整行高亮，收起选区后恢复', async () => {
    const container = document.createElement('div')
    container.style.cssText = 'width: 600px; height: 200px;'
    document.body.append(container)

    const editor = monaco.editor.create(container, {
      automaticLayout: false,
      language: 'plaintext',
      value: [
        'changeFigure:stand.webp',
        '  -id=hero;',
        'say:next;',
      ].join('\n'),
    })
    const controller = createTextEditorStatementHighlightController({
      editor,
      isEnabled: () => true,
    })
    const readHighlights = () => container.querySelectorAll('.cdr.logical-statement-highlight')

    editor.setPosition({ lineNumber: 2, column: 3 })
    controller.syncFromEditorPosition()
    await nextFrames()
    expect(readHighlights()).toHaveLength(2)

    // 有选区时不渲染高亮，否则不透明的整行背景会盖住选区
    editor.setSelection(new monaco.Selection(2, 1, 2, 20))
    controller.syncFromEditorPosition()
    await nextFrames()
    expect(container.querySelector('.cslr.selected-text')).not.toBeNull()
    expect(readHighlights()).toHaveLength(0)

    editor.setPosition({ lineNumber: 2, column: 3 })
    controller.syncFromEditorPosition()
    await nextFrames()
    expect(readHighlights()).toHaveLength(2)

    editor.dispose()
    container.remove()
  })
})
