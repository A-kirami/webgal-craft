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
