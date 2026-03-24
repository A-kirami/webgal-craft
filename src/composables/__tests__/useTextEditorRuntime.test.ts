import { describe, expect, it, vi } from 'vitest'

import {
  applySceneCursorTarget,
  prepareSceneCursorTarget,
} from '~/helper/text-editor-scene-restore'

describe('applySceneCursorTarget', () => {
  it('会用仅在视口外才滚动的策略恢复文本光标目标，而不是强制居中', () => {
    const editor = {
      layout: vi.fn(),
      revealPositionInCenterIfOutsideViewport: vi.fn(),
      setPosition: vi.fn(),
    }

    applySceneCursorTarget(editor, {
      shouldUpdatePosition: true,
      targetPosition: {
        lineNumber: 12,
        column: 1,
      },
    }, 1)

    expect(editor.layout).toHaveBeenCalledTimes(1)
    expect(editor.setPosition).toHaveBeenCalledWith({
      lineNumber: 12,
      column: 1,
    })
    expect(editor.revealPositionInCenterIfOutsideViewport).toHaveBeenCalledWith(
      {
        lineNumber: 12,
        column: 1,
      },
      1,
    )
  })
})

describe('prepareSceneCursorTarget', () => {
  it('可以先同步文本光标位置，而不立刻触发 reveal', () => {
    const editor = {
      layout: vi.fn(),
      revealPositionInCenterIfOutsideViewport: vi.fn(),
      setPosition: vi.fn(),
    }

    prepareSceneCursorTarget(editor, {
      shouldUpdatePosition: true,
      targetPosition: {
        lineNumber: 12,
        column: 1,
      },
    })

    expect(editor.setPosition).toHaveBeenCalledWith({
      lineNumber: 12,
      column: 1,
    })
    expect(editor.layout).not.toHaveBeenCalled()
    expect(editor.revealPositionInCenterIfOutsideViewport).not.toHaveBeenCalled()
  })
})
