import type * as monaco from 'monaco-editor'

export interface TextEditorHistoryAdapterCallbacks {
  captureBeforeContentChange: () => void
  handleCompositionEnd: () => void
  handleCompositionStart: () => void
  handleRedo: () => void
  handleUndo: () => void
  isComposing: () => boolean
}

export interface TextEditorHistoryAdapterHandle {
  dispose: () => void
  runNativeRedo: () => Promise<void>
  runNativeUndo: () => Promise<void>
}

// 保持适配层只依赖 Monaco 的类型声明，避免单测为了键位枚举去加载编辑器运行时。
export const textEditorHistoryKeyCode = {
  backspace: 1,
  tab: 2,
  enter: 3,
  delete: 20,
  keyY: 55,
  keyZ: 56,
} as const

const textEditorHistoryKeyMod = {
  shift: 1024,
  ctrlCmd: 2048,
} as const

export function shouldCaptureBeforeContentChangeKeydown(event: monaco.IKeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return false
  }

  const key = event.browserEvent.key
  if (key.length === 1) {
    return true
  }

  return event.keyCode === textEditorHistoryKeyCode.backspace
    || event.keyCode === textEditorHistoryKeyCode.delete
    || event.keyCode === textEditorHistoryKeyCode.enter
    || event.keyCode === textEditorHistoryKeyCode.tab
}

export function installTextEditorHistoryAdapter(
  editor: monaco.editor.IStandaloneCodeEditor,
  callbacks: TextEditorHistoryAdapterCallbacks,
): TextEditorHistoryAdapterHandle {
  const originalGetAction = editor.getAction
  let pendingShortcutUndo = false
  let pendingShortcutRedo = false

  function requestShortcutUndo() {
    if (pendingShortcutUndo) {
      return
    }

    pendingShortcutUndo = true
    queueMicrotask(() => {
      pendingShortcutUndo = false
    })
    callbacks.handleUndo()
  }

  function requestShortcutRedo() {
    if (pendingShortcutRedo) {
      return
    }

    pendingShortcutRedo = true
    queueMicrotask(() => {
      pendingShortcutRedo = false
    })
    callbacks.handleRedo()
  }

  const keydownDisposable = editor.onKeyDown((event) => {
    if (callbacks.isComposing()) {
      return
    }

    if (shouldCaptureBeforeContentChangeKeydown(event)) {
      callbacks.captureBeforeContentChange()
    }
  })
  const compositionStartDisposable = editor.onDidCompositionStart(() => {
    if (callbacks.isComposing()) {
      return
    }

    callbacks.captureBeforeContentChange()
    callbacks.handleCompositionStart()
  })
  const compositionEndDisposable = editor.onDidCompositionEnd(() => {
    callbacks.handleCompositionEnd()
  })

  editor.getAction = (actionId) => {
    const action = originalGetAction.call(editor, actionId)
    if (!action) {
      return action
    }

    if (isUndoCommandId(actionId)) {
      return createHistoryActionProxy(action, callbacks.handleUndo)
    }

    if (isRedoCommandId(actionId)) {
      return createHistoryActionProxy(action, callbacks.handleRedo)
    }

    return action
  }

  const domNode = editor.getDomNode()
  let removeDomInterceptors = () => {
    void 0
  }
  if (domNode) {
    const handleNativeHistoryBeforeInput = (event: InputEvent) => {
      if (event.inputType === 'historyUndo') {
        stopHistoryDomEvent(event)
        requestShortcutUndo()
        return
      }

      if (event.inputType === 'historyRedo') {
        stopHistoryDomEvent(event)
        requestShortcutRedo()
        return
      }

      if (callbacks.isComposing()) {
        return
      }

      callbacks.captureBeforeContentChange()
    }

    const handleClipboardMutation = () => {
      callbacks.captureBeforeContentChange()
    }

    domNode.addEventListener('beforeinput', handleNativeHistoryBeforeInput, true)
    domNode.addEventListener('paste', handleClipboardMutation, true)
    domNode.addEventListener('cut', handleClipboardMutation, true)
    removeDomInterceptors = () => {
      domNode.removeEventListener('beforeinput', handleNativeHistoryBeforeInput, true)
      domNode.removeEventListener('paste', handleClipboardMutation, true)
      domNode.removeEventListener('cut', handleClipboardMutation, true)
    }
  }

  editor.addCommand(textEditorHistoryKeyMod.ctrlCmd | textEditorHistoryKeyCode.keyZ, () => requestShortcutUndo())
  editor.addCommand(
    textEditorHistoryKeyMod.ctrlCmd | textEditorHistoryKeyMod.shift | textEditorHistoryKeyCode.keyZ,
    () => requestShortcutRedo(),
  )
  editor.addCommand(textEditorHistoryKeyMod.ctrlCmd | textEditorHistoryKeyCode.keyY, () => requestShortcutRedo())

  return {
    dispose() {
      keydownDisposable.dispose()
      compositionStartDisposable.dispose()
      compositionEndDisposable.dispose()
      removeDomInterceptors()
      editor.getAction = originalGetAction
    },
    async runNativeRedo() {
      editor.trigger('keyboard', 'redo', {})
    },
    async runNativeUndo() {
      editor.trigger('keyboard', 'undo', {})
    },
  }
}

function isUndoCommandId(commandId: string): boolean {
  return commandId === 'undo' || commandId === 'editor.action.undo'
}

function isRedoCommandId(commandId: string): boolean {
  return commandId === 'redo' || commandId === 'editor.action.redo'
}

function stopHistoryDomEvent(event: Event) {
  event.preventDefault()
  event.stopPropagation()
  if ('stopImmediatePropagation' in event) {
    event.stopImmediatePropagation()
  }
}

function createHistoryActionProxy(
  action: monaco.editor.IEditorAction,
  run: () => void,
): monaco.editor.IEditorAction {
  return {
    ...action,
    run: async () => {
      run()
    },
  }
}
