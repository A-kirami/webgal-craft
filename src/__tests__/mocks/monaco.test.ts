import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMonacoMockModule, monacoMockState, resetMonacoMockState } from './monaco'

describe('Monaco mock 模拟器', () => {
  beforeEach(() => {
    resetMonacoMockState()
  })

  it('提供与历史适配器兼容的 editor 实例契约', async () => {
    const monaco = createMonacoMockModule()
    const editor = monaco.editor.create({} as HTMLElement, {})
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
    expect(monaco.editor.MouseTargetType.CONTENT_TEXT).toBe(6)
    expect(monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN).toBe(2)
  })

  it('deltaDecorations 会为每个 decoration 返回可回传的不透明 id', () => {
    const firstIds = monacoMockState.editorInstance.deltaDecorations([], [{}, {}])
    const secondIds = monacoMockState.editorInstance.deltaDecorations(firstIds, [{}])

    expect(firstIds).toHaveLength(2)
    expect(firstIds.every(id => typeof id === 'string' && id.length > 0)).toBe(true)
    expect(new Set(firstIds).size).toBe(firstIds.length)
    expect(secondIds).toHaveLength(1)
    expect(secondIds[0]).not.toBe(firstIds[0])
    expect(secondIds[0]).not.toBe(firstIds[1])

    resetMonacoMockState()

    expect(monacoMockState.editorInstance.deltaDecorations([], [{}])).toHaveLength(1)
  })
})
