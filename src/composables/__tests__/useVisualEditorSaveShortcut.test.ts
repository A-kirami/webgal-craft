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

import { createVisualEditorSaveShortcutHandler } from '~/composables/useVisualEditorSaveShortcut'

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

describe('createVisualEditorSaveShortcutHandler 行为', () => {
  it('仅在当前激活的 visual 投影下响应保存快捷键', async () => {
    const saveFile = vi.fn(async () => undefined)
    const onError = vi.fn()
    const handler = createVisualEditorSaveShortcutHandler({
      getPath: () => '/game/scene/example.txt',
      getActivePath: () => '/game/scene/example.txt',
      getActiveProjection: () => 'visual',
      saveFile,
      onError,
    })

    const event = createKeyboardEvent({ ctrlKey: true, key: 's' })
    handler(event)
    await Promise.resolve()

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(saveFile).toHaveBeenCalledWith('/game/scene/example.txt')
    expect(onError).not.toHaveBeenCalled()
  })

  it('隐藏态或非当前标签页时忽略保存快捷键', async () => {
    const saveFile = vi.fn(async () => undefined)
    const onError = vi.fn()
    const hiddenHandler = createVisualEditorSaveShortcutHandler({
      getPath: () => '/game/scene/example.txt',
      getActivePath: () => '/game/scene/example.txt',
      getActiveProjection: () => 'text',
      saveFile,
      onError,
    })
    const inactiveTabHandler = createVisualEditorSaveShortcutHandler({
      getPath: () => '/game/scene/example.txt',
      getActivePath: () => '/game/scene/other.txt',
      getActiveProjection: () => 'visual',
      saveFile,
      onError,
    })

    const hiddenEvent = createKeyboardEvent({ metaKey: true, key: 's' })
    hiddenHandler(hiddenEvent)
    inactiveTabHandler(hiddenEvent)
    await Promise.resolve()

    expect(hiddenEvent.preventDefault).not.toHaveBeenCalled()
    expect(saveFile).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('保存失败时交给统一错误处理', async () => {
    const error = new Error('save failed')
    const saveFile = vi.fn(async () => {
      throw error
    })
    const onError = vi.fn()
    const handler = createVisualEditorSaveShortcutHandler({
      getPath: () => '/game/scene/example.txt',
      getActivePath: () => '/game/scene/example.txt',
      getActiveProjection: () => 'visual',
      saveFile,
      onError,
    })

    const event = createKeyboardEvent({ ctrlKey: true, key: 's' })
    await handler(event)

    expect(onError).toHaveBeenCalledWith(error)
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })
})
