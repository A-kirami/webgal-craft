import { describe, expect, it } from 'vitest'

import { resolveVisualEditorCommandDropAction } from '~/features/editor/visual-editor/visual-editor-command-drop'

import type { CommandPanelStatementDragPayload } from '~/types/drag-drop'

function createPayload(rawTexts: string[]): CommandPanelStatementDragPayload {
  return {
    label: 'Say',
    rawTexts,
    source: 'command-panel',
    type: 'command-panel-statement',
  }
}

describe('resolveVisualEditorCommandDropAction', () => {
  it('gap 区投放命令会生成指定位置的插入动作', () => {
    const action = resolveVisualEditorCommandDropAction({
      insertIndex: 2,
      payload: createPayload(['changeBg:room.png;']),
      placement: 'gap',
    })

    expect(action).toEqual({
      kind: 'insert-statements',
      insertIndex: 2,
      rawTexts: ['changeBg:room.png;'],
    })
  })

  it('语句组投放会保留多条 rawTexts', () => {
    const action = resolveVisualEditorCommandDropAction({
      insertIndex: 5,
      payload: createPayload(['changeBg:room.png;', 'bgm:theme.ogg;']),
      placement: 'tail',
    })

    expect(action).toEqual({
      kind: 'insert-statements',
      insertIndex: 5,
      rawTexts: ['changeBg:room.png;', 'bgm:theme.ogg;'],
    })
  })

  it('update 区不会接受命令面板语句投放', () => {
    const action = resolveVisualEditorCommandDropAction({
      insertIndex: 1,
      payload: createPayload(['changeBg:room.png;']),
      placement: 'update',
    })

    expect(action).toBeUndefined()
  })
})
