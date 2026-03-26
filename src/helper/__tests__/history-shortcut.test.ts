import { describe, expect, it } from 'vitest'

import { resolveHistoryShortcutAction } from '../history-shortcut'

function createKeyboardEvent(overrides: Partial<{
  ctrlKey: boolean
  key: string
  metaKey: boolean
  shiftKey: boolean
}> = {}) {
  return {
    ctrlKey: false,
    key: '',
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }
}

describe('resolveHistoryShortcutAction 快捷键解析', () => {
  it('识别 mod+z 和 mod+shift+z', () => {
    expect(resolveHistoryShortcutAction(createKeyboardEvent({
      ctrlKey: true,
      key: 'z',
    }))).toBe('undo')

    expect(resolveHistoryShortcutAction(createKeyboardEvent({
      ctrlKey: true,
      key: 'z',
      shiftKey: true,
    }))).toBe('redo')
  })

  it('识别 mod+y 作为重做快捷键', () => {
    expect(resolveHistoryShortcutAction(createKeyboardEvent({
      metaKey: true,
      key: 'y',
    }))).toBe('redo')
  })

  it('忽略非历史快捷键', () => {
    expect(resolveHistoryShortcutAction(createKeyboardEvent({
      key: 'z',
    }))).toBeUndefined()

    expect(resolveHistoryShortcutAction(createKeyboardEvent({
      ctrlKey: true,
      key: 'x',
    }))).toBeUndefined()
  })
})
