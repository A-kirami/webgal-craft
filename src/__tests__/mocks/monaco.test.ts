import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMonacoMockModule, monacoMockState, resetMonacoMockState } from './monaco'

describe('Monaco mock', () => {
  beforeEach(() => {
    resetMonacoMockState()
  })

  it('提供与历史适配器兼容的 editor 实例契约', async () => {
    const editor = createMonacoMockModule().editor.create({} as HTMLElement, {})
    const keydownDisposable = editor.onKeyDown(() => undefined)
    const compositionStartDisposable = editor.onDidCompositionStart(() => undefined)
    const compositionEndDisposable = editor.onDidCompositionEnd(() => undefined)
    const undoAction = editor.getAction('editor.action.undo')
    const redoAction = editor.getAction('editor.action.redo')
    const domNode = editor.getDomNode()

    expect(keydownDisposable).toEqual(expect.objectContaining({
      dispose: expect.any(Function),
    }))
    expect(compositionStartDisposable).toEqual(expect.objectContaining({
      dispose: expect.any(Function),
    }))
    expect(compositionEndDisposable).toEqual(expect.objectContaining({
      dispose: expect.any(Function),
    }))
    expect(undoAction).toBeDefined()
    expect(undoAction).toEqual(expect.objectContaining({
      id: 'editor.action.undo',
      label: 'editor.action.undo',
      run: expect.any(Function),
    }))
    expect(redoAction).toBeDefined()
    expect(redoAction).toEqual(expect.objectContaining({
      id: 'editor.action.redo',
      label: 'editor.action.redo',
      run: expect.any(Function),
    }))
    expect(domNode).not.toBeNull()
    expect(domNode).toEqual(expect.objectContaining({
      addEventListener: expect.any(Function),
      removeEventListener: expect.any(Function),
    }))

    expect(() => keydownDisposable.dispose()).not.toThrow()
    expect(() => compositionStartDisposable.dispose()).not.toThrow()
    expect(() => compositionEndDisposable.dispose()).not.toThrow()
    await expect(undoAction?.run()).resolves.toBeUndefined()
    await expect(redoAction?.run()).resolves.toBeUndefined()
    if (!domNode) {
      throw new Error('Expected Monaco mock to provide a DOM node')
    }
    expect(() => domNode.addEventListener('beforeinput', vi.fn(), true)).not.toThrow()
    expect(() => domNode.removeEventListener('beforeinput', vi.fn(), true)).not.toThrow()
    expect(() => editor.trigger('keyboard', 'undo', {})).not.toThrow()
    expect(() => editor.trigger('keyboard', 'redo', {})).not.toThrow()
    expect(editor.trigger).toHaveBeenCalledWith('keyboard', 'undo', {})
    expect(editor.trigger).toHaveBeenCalledWith('keyboard', 'redo', {})
  })

  it('deltaDecorations 会在多次调用之间生成全局递增的 decoration id', () => {
    expect(monacoMockState.editorInstance.deltaDecorations([], [{}, {}])).toEqual([
      'decoration-1',
      'decoration-2',
    ])
    expect(monacoMockState.editorInstance.deltaDecorations(['decoration-1'], [{}])).toEqual([
      'decoration-3',
    ])

    resetMonacoMockState()

    expect(monacoMockState.editorInstance.deltaDecorations([], [{}])).toEqual([
      'decoration-1',
    ])
  })
})
