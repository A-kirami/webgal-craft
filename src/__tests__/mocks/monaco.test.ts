import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMonacoMockModule, monacoMockState, resetMonacoMockState } from './monaco'

interface MonacoActionStub {
  id: string
  label: string
  run: () => Promise<void>
}

interface MonacoDomNodeStub {
  addEventListener: (type: string, listener: unknown, options?: boolean) => void
  removeEventListener: (type: string, listener: unknown, options?: boolean) => void
}

interface MonacoEditorStub {
  getAction: (actionId: string) => MonacoActionStub
  getDomNode: () => MonacoDomNodeStub
  onDidCompositionEnd: (listener: () => void) => { dispose: () => void }
  onDidCompositionStart: (listener: () => void) => { dispose: () => void }
  onKeyDown: (listener: () => void) => { dispose: () => void }
  trigger: (source: string, command: string, payload: object) => void
}

function createMockEditor(): MonacoEditorStub {
  return (
    createMonacoMockModule().editor.create as unknown as () => MonacoEditorStub
  )()
}

function callDeltaDecorations(previousDecorations: string[], nextDecorations: unknown[]) {
  return (
    monacoMockState.editorInstance.deltaDecorations as unknown as ((
      previousDecorations_: string[],
      nextDecorations_: unknown[],
    ) => string[])
  )(previousDecorations, nextDecorations)
}

describe('Monaco mock', () => {
  beforeEach(() => {
    resetMonacoMockState()
  })

  it('提供与历史适配器兼容的 editor 实例契约', () => {
    const editor = createMockEditor()
    const keydownDisposable = editor.onKeyDown(() => undefined)
    const compositionStartDisposable = editor.onDidCompositionStart(() => undefined)
    const compositionEndDisposable = editor.onDidCompositionEnd(() => undefined)
    const action = editor.getAction('editor.action.undo')
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
    expect(action).toEqual(expect.objectContaining({
      id: 'editor.action.undo',
      label: 'editor.action.undo',
      run: expect.any(Function),
    }))
    expect(domNode).toEqual(expect.objectContaining({
      addEventListener: expect.any(Function),
      removeEventListener: expect.any(Function),
    }))

    expect(() => keydownDisposable.dispose()).not.toThrow()
    expect(() => compositionStartDisposable.dispose()).not.toThrow()
    expect(() => compositionEndDisposable.dispose()).not.toThrow()
    expect(() => domNode.addEventListener('beforeinput', vi.fn(), true)).not.toThrow()
    expect(() => domNode.removeEventListener('beforeinput', vi.fn(), true)).not.toThrow()
    expect(() => editor.trigger('keyboard', 'undo', {})).not.toThrow()
    expect(editor.trigger).toHaveBeenCalledWith('keyboard', 'undo', {})
  })

  it('deltaDecorations 会在多次调用之间生成全局递增的 decoration id', () => {
    expect(callDeltaDecorations([], [{}, {}])).toEqual([
      'decoration-1',
      'decoration-2',
    ])
    expect(callDeltaDecorations(['decoration-1'], [{}])).toEqual([
      'decoration-3',
    ])

    resetMonacoMockState()

    expect(callDeltaDecorations([], [{}])).toEqual([
      'decoration-1',
    ])
  })
})
