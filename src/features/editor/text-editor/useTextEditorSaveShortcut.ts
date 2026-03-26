import { createEditorSaveShortcutHandler } from '~/features/editor/shared/editor-save-shortcut'

import { useEditorSaveShortcut } from '../shared/useEditorSaveShortcut'

import type { EditorSaveShortcutHandlerOptions } from '~/features/editor/shared/editor-save-shortcut'

interface TextEditorSaveShortcutHandlerOptions extends Omit<
  EditorSaveShortcutHandlerOptions,
  'canHandle' | 'targetProjection'
> {
  isEditorFocused: () => boolean
}

export function createTextEditorSaveShortcutHandler(
  options: TextEditorSaveShortcutHandlerOptions,
) {
  return createEditorSaveShortcutHandler({
    targetProjection: 'text',
    ...options,
    canHandle: () => !options.isEditorFocused(),
  })
}

export function useTextEditorSaveShortcut(
  path: MaybeRefOrGetter<string>,
  options: {
    isEditorFocused: () => boolean
  },
) {
  useEditorSaveShortcut(path, {
    projection: 'text',
    canHandle: () => !options.isEditorFocused(),
  })
}
