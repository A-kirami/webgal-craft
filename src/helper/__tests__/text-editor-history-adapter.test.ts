import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  installTextEditorHistoryAdapter,
  shouldCaptureBeforeContentChangeKeydown,
  textEditorHistoryKeyCode,
} from '../text-editor-history-adapter'

import type * as monaco from 'monaco-editor'

class FakeDomNode {
  private listeners = new Map<string, Set<(event: Event) => void>>()

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const handler = normalizeListener(listener)
    const registered = this.listeners.get(type) ?? new Set()
    registered.add(handler)
    this.listeners.set(type, registered)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(normalizeListener(listener))
  }

  dispatch(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

function normalizeListener(listener: EventListenerOrEventListenerObject): (event: Event) => void {
  return typeof listener === 'function'
    ? listener
    : event => listener.handleEvent(event)
}

function createInputEvent(inputType: string): InputEvent {
  const event = {
    inputType,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    stopPropagation: vi.fn(),
    type: 'beforeinput',
  }

  return event as unknown as InputEvent
}

function createMonacoKeydownEvent(
  keyCode: number,
  options: {
    altKey?: boolean
    ctrlKey?: boolean
    key?: string
    metaKey?: boolean
    shiftKey?: boolean
  } = {},
): monaco.IKeyboardEvent {
  return {
    altKey: options.altKey ?? false,
    browserEvent: { key: options.key ?? '' } as KeyboardEvent,
    ctrlKey: options.ctrlKey ?? false,
    keyCode,
    metaKey: options.metaKey ?? false,
    preventDefault: vi.fn(),
    shiftKey: options.shiftKey ?? false,
    stopPropagation: vi.fn(),
  } as unknown as monaco.IKeyboardEvent
}

function createFakeEditor() {
  const domNode = new FakeDomNode()
  const compositionEndListeners: (() => void)[] = []
  const compositionStartListeners: (() => void)[] = []
  const keydownListeners: ((event: monaco.IKeyboardEvent) => void)[] = []
  const commandHandlers = new Map<number, () => void>()
  const model = {
    uri: {
      toString: vi.fn(() => '/game/animation.json'),
    },
  }
  const action = {
    id: 'editor.action.undo',
    run: vi.fn(async () => undefined),
  }

  const editor = {
    addCommand: vi.fn((keybinding: number, handler: () => void) => {
      commandHandlers.set(keybinding, handler)
      return 'command-id'
    }),
    getAction: vi.fn(() => action),
    getDomNode: vi.fn(() => domNode as unknown as HTMLElement),
    getModel: vi.fn(() => model),
    onDidCompositionEnd: vi.fn((listener: () => void) => {
      compositionEndListeners.push(listener)
      return {
        dispose() {
          const index = compositionEndListeners.indexOf(listener)
          if (index !== -1) {
            compositionEndListeners.splice(index, 1)
          }
        },
      }
    }),
    onDidCompositionStart: vi.fn((listener: () => void) => {
      compositionStartListeners.push(listener)
      return {
        dispose() {
          const index = compositionStartListeners.indexOf(listener)
          if (index !== -1) {
            compositionStartListeners.splice(index, 1)
          }
        },
      }
    }),
    onKeyDown: vi.fn((listener: (event: monaco.IKeyboardEvent) => void) => {
      keydownListeners.push(listener)
      return {
        dispose() {
          const index = keydownListeners.indexOf(listener)
          if (index !== -1) {
            keydownListeners.splice(index, 1)
          }
        },
      }
    }),
    trigger: vi.fn(),
  } as unknown as monaco.editor.IStandaloneCodeEditor

  return {
    action,
    commandHandlers,
    compositionEndListeners,
    compositionStartListeners,
    domNode,
    editor,
    keydownListeners,
    model,
  }
}

describe('文本编辑器历史适配器', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('识别历史快捷键与普通输入捕获条件', () => {
    expect(shouldCaptureBeforeContentChangeKeydown(
      createMonacoKeydownEvent(0, { key: 'a' }),
    )).toBe(true)
    expect(shouldCaptureBeforeContentChangeKeydown(
      createMonacoKeydownEvent(textEditorHistoryKeyCode.keyZ, { ctrlKey: true, key: 'z' }),
    )).toBe(false)
  })

  it('安装后会拦截 undo/redo 并在卸载后恢复 getAction', async () => {
    const { action, commandHandlers, editor, keydownListeners } = createFakeEditor()
    const callbacks = {
      captureBeforeContentChange: vi.fn(),
      handleCompositionEnd: vi.fn(),
      handleCompositionStart: vi.fn(),
      handleRedo: vi.fn(),
      handleUndo: vi.fn(),
      isComposing: vi.fn(() => false),
    }

    const originalGetAction = editor.getAction
    const adapter = installTextEditorHistoryAdapter(editor, callbacks)

    keydownListeners[0]?.(createMonacoKeydownEvent(0, { key: 'a' }))
    expect(callbacks.captureBeforeContentChange).toHaveBeenCalledTimes(1)

    commandHandlers.get(2048 | textEditorHistoryKeyCode.keyZ)?.()
    expect(callbacks.handleUndo).toHaveBeenCalledTimes(1)

    const proxiedAction = editor.getAction('editor.action.undo')
    await proxiedAction?.run()
    expect(callbacks.handleUndo).toHaveBeenCalledTimes(2)
    expect(action.run).not.toHaveBeenCalled()

    await adapter.runNativeUndo()
    expect(editor.trigger).toHaveBeenCalledWith('keyboard', 'undo', {})
    expect(action.run).not.toHaveBeenCalled()

    adapter.dispose()

    expect(editor.getAction).toBe(originalGetAction)
  })

  it('会从 DOM beforeinput 与剪贴板事件触发历史处理', async () => {
    const { action, commandHandlers, domNode, editor } = createFakeEditor()
    const callbacks = {
      captureBeforeContentChange: vi.fn(),
      handleCompositionEnd: vi.fn(),
      handleCompositionStart: vi.fn(),
      handleRedo: vi.fn(),
      handleUndo: vi.fn(),
      isComposing: vi.fn(() => false),
    }

    const adapter = installTextEditorHistoryAdapter(editor, callbacks)

    domNode.dispatch('beforeinput', createInputEvent('historyUndo'))
    expect(callbacks.handleUndo).toHaveBeenCalledTimes(1)

    commandHandlers.get(2048 | textEditorHistoryKeyCode.keyZ)?.()
    expect(callbacks.handleUndo).toHaveBeenCalledTimes(1)

    await Promise.resolve()
    commandHandlers.get(2048 | textEditorHistoryKeyCode.keyZ)?.()
    expect(callbacks.handleUndo).toHaveBeenCalledTimes(2)

    domNode.dispatch('paste', { type: 'paste' } as Event)
    expect(callbacks.captureBeforeContentChange).toHaveBeenCalledTimes(1)

    const proxiedAction = editor.getAction('editor.action.undo')
    await proxiedAction?.run()
    expect(callbacks.handleUndo).toHaveBeenCalledTimes(3)
    expect(action.run).not.toHaveBeenCalled()

    adapter.dispose()
  })

  it('组合输入期间不会重复覆盖历史前态快照', () => {
    const {
      compositionEndListeners,
      compositionStartListeners,
      domNode,
      editor,
      keydownListeners,
    } = createFakeEditor()
    const isComposing = vi.fn(() => false)
    const callbacks = {
      captureBeforeContentChange: vi.fn(),
      handleCompositionEnd: vi.fn(() => {
        isComposing.mockReturnValue(false)
      }),
      handleCompositionStart: vi.fn(() => {
        isComposing.mockReturnValue(true)
      }),
      handleRedo: vi.fn(),
      handleUndo: vi.fn(),
      isComposing,
    }

    installTextEditorHistoryAdapter(editor, callbacks)

    compositionStartListeners[0]?.()
    keydownListeners[0]?.(createMonacoKeydownEvent(0, { key: 'n' }))
    domNode.dispatch('beforeinput', createInputEvent('insertCompositionText'))

    expect(callbacks.captureBeforeContentChange).toHaveBeenCalledTimes(1)
    expect(callbacks.handleCompositionStart).toHaveBeenCalledTimes(1)

    compositionEndListeners[0]?.()
    keydownListeners[0]?.(createMonacoKeydownEvent(0, { key: 'a' }))

    expect(callbacks.handleCompositionEnd).toHaveBeenCalledTimes(1)
    expect(callbacks.captureBeforeContentChange).toHaveBeenCalledTimes(2)
  })
})
