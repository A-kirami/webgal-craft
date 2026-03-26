import { describe, expect, it, vi } from 'vitest'

vi.mock('~/stores/editor', () => ({
  isEditableEditor: (state: unknown) => typeof state === 'object' && state !== null && 'projection' in state,
  useEditorStore: vi.fn(),
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: vi.fn(),
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: vi.fn(),
}))

import { createTextEditorSaveShortcutHandler } from '~/composables/useTextEditorSaveShortcut'

function createKeyboardEvent(overrides: Partial<{
  ctrlKey: boolean
  metaKey: boolean
  key: string
}> = {}) {
  return {
    ctrlKey: false,
    metaKey: false,
    key: '',
    preventDefault: vi.fn(),
    ...overrides,
  }
}

describe('createTextEditorSaveShortcutHandler 行为', () => {
  it('仅在当前激活的 text 投影且编辑器未聚焦时响应保存快捷键', async () => {
    const saveFile = vi.fn(async () => undefined)
    const onError = vi.fn()
    const handler = createTextEditorSaveShortcutHandler({
      getPath: () => '/game/scene/example.txt',
      getActivePath: () => '/game/scene/example.txt',
      getActiveProjection: () => 'text',
      isEditorFocused: () => false,
      saveFile,
      onError,
    })

    const event = createKeyboardEvent({ ctrlKey: true, key: 's' })
    await handler(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(saveFile).toHaveBeenCalledWith('/game/scene/example.txt')
    expect(onError).not.toHaveBeenCalled()
  })

  it('编辑器自身持有焦点时忽略全局保存快捷键，避免重复触发', async () => {
    const saveFile = vi.fn(async () => undefined)
    const onError = vi.fn()
    const handler = createTextEditorSaveShortcutHandler({
      getPath: () => '/game/scene/example.txt',
      getActivePath: () => '/game/scene/example.txt',
      getActiveProjection: () => 'text',
      isEditorFocused: () => true,
      saveFile,
      onError,
    })

    const event = createKeyboardEvent({ metaKey: true, key: 's' })
    await handler(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(saveFile).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('保存失败时交给统一错误处理', async () => {
    const error = new Error('save failed')
    const saveFile = vi.fn(async () => {
      throw error
    })
    const onError = vi.fn()
    const handler = createTextEditorSaveShortcutHandler({
      getPath: () => '/game/scene/example.txt',
      getActivePath: () => '/game/scene/example.txt',
      getActiveProjection: () => 'text',
      isEditorFocused: () => false,
      saveFile,
      onError,
    })

    const event = createKeyboardEvent({ ctrlKey: true, key: 's' })
    await handler(event)

    expect(onError).toHaveBeenCalledWith(error)
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })
})
