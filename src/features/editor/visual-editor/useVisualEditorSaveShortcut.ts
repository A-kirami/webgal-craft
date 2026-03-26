import { createEditorSaveShortcutHandler, EditorSaveShortcutHandlerOptions } from '~/features/editor/shared/editor-save-shortcut'
import { useEditorSaveShortcut } from '~/features/editor/shared/useEditorSaveShortcut'

type VisualEditorSaveShortcutHandlerOptions = Omit<
  EditorSaveShortcutHandlerOptions,
  'canHandle' | 'targetProjection'
>

export function createVisualEditorSaveShortcutHandler(
  options: VisualEditorSaveShortcutHandlerOptions,
) {
  return createEditorSaveShortcutHandler({
    targetProjection: 'visual',
    ...options,
  })
}

export function useVisualEditorSaveShortcut(
  path: MaybeRefOrGetter<string>,
) {
  useEditorSaveShortcut(path, {
    projection: 'visual',
  })
}
