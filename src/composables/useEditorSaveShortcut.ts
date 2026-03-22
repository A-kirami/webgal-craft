import { createEditorSaveShortcutHandler } from '~/helper/editor-save-shortcut'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { useTabsStore } from '~/stores/tabs'
import { handleError } from '~/utils/error-handler'

interface UseEditorSaveShortcutOptions {
  projection: 'text' | 'visual'
  canHandle?: () => boolean
}

export function useEditorSaveShortcut(
  path: MaybeRefOrGetter<string>,
  options: UseEditorSaveShortcutOptions,
) {
  const editorStore = useEditorStore()
  const tabsStore = useTabsStore()

  const activeProjection = computed(() => {
    const currentState = editorStore.currentState
    return currentState && isEditableEditor(currentState) ? currentState.projection : undefined
  })

  const handleSaveShortcut = createEditorSaveShortcutHandler({
    targetProjection: options.projection,
    getPath: () => toValue(path),
    getActivePath: () => tabsStore.activeTab?.path,
    getActiveProjection: () => activeProjection.value,
    canHandle: options.canHandle,
    saveFile: currentPath => editorStore.saveFile(currentPath),
    onError: error => handleError(error, { silent: true }),
  })

  useEventListener('keydown', handleSaveShortcut)
}
