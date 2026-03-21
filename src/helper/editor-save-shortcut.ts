export interface EditorSaveShortcutKeyboardEvent {
  ctrlKey: boolean
  metaKey: boolean
  key: string
  preventDefault: () => void
}

export interface EditorSaveShortcutHandlerOptions {
  targetProjection: 'text' | 'visual'
  getPath: () => string
  getActivePath: () => string | undefined
  getActiveProjection: () => 'text' | 'visual' | undefined
  saveFile: (path: string) => Promise<unknown> | unknown
  onError: (error: unknown) => void
  canHandle?: () => boolean
}

export function createEditorSaveShortcutHandler(
  options: EditorSaveShortcutHandlerOptions,
) {
  return async function handleEditorSaveShortcut(event: EditorSaveShortcutKeyboardEvent): Promise<void> {
    const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'
    if (!isSaveShortcut) {
      return
    }

    const path = options.getPath()
    if (
      options.getActiveProjection() !== options.targetProjection
      || options.getActivePath() !== path
      || options.canHandle?.() === false
    ) {
      return
    }

    event.preventDefault()
    try {
      await options.saveFile(path)
    } catch (error) {
      options.onError(error)
    }
  }
}
