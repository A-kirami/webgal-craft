import { createEditorSaveShortcutHandler } from '~/helper/editor-save-shortcut'

import { useEditorSaveShortcut } from './useEditorSaveShortcut'

import type { EditorSaveShortcutHandlerOptions } from '~/helper/editor-save-shortcut'

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
