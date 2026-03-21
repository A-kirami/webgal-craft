export type HistoryShortcutAction = 'redo' | 'undo'

interface HistoryShortcutKeyboardEvent {
  ctrlKey: boolean
  key: string
  metaKey: boolean
  shiftKey: boolean
}

export function resolveHistoryShortcutAction(
  event: HistoryShortcutKeyboardEvent,
): HistoryShortcutAction | undefined {
  if (!(event.ctrlKey || event.metaKey)) {
    return
  }

  const key = event.key.toLowerCase()
  if (key === 'y') {
    return 'redo'
  }

  if (key !== 'z') {
    return
  }

  return event.shiftKey ? 'redo' : 'undo'
}
