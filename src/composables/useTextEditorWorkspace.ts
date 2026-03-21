import { LRUCache } from 'lru-cache'
import * as monaco from 'monaco-editor'

import { normalizeEditorViewState } from '~/helper/text-editor-view-state'
import { shouldRestoreTextEditorFocus } from '~/helper/text-editor-workspace-focus'

import type { TextEditorWorkspaceFileState } from '~/helper/text-editor-workspace-focus'

interface FileWorkspaceState extends TextEditorWorkspaceFileState {
  viewState?: monaco.editor.ICodeEditorViewState | null
}

interface RestoreViewStateContext {
  isCreating?: boolean
  isSwitching?: boolean
}

interface SwitchModelOptions {
  language: string
  newPath: string
  oldPath: string
  value: string
}

interface UseTextEditorWorkspaceOptions {
  editorRef: ShallowRef<monaco.editor.IStandaloneCodeEditor | undefined>
  focusEditor: () => void
  initializeSceneSelectionFromRestoredCursor: () => void
  isCurrentTabPreview: () => boolean
  shouldPersistPersistentViewState: (path: string) => boolean
}

const MAX_CACHED_MODELS = 50

export function useTextEditorWorkspace(options: UseTextEditorWorkspaceOptions) {
  const tabsStore = useTabsStore()
  const viewStateStore = useEditorViewStateStore()
  const fileSystemEvents = useFileSystemEvents()

  const fileStates = new Map<string, FileWorkspaceState>()
  const modelAccessCache = new LRUCache<string, boolean>({
    max: MAX_CACHED_MODELS,
    dispose: (_value, path) => {
      const uri = monaco.Uri.parse(path)
      const model = monaco.editor.getModel(uri)
      if (model) {
        model.dispose()
        logger.debug(`[TextEditor] LRU 淘汰模型: ${path}`)
      }
    },
  })

  let hasCreatedEditorBefore = false

  const stopFileRenamedListener = fileSystemEvents.on('file:renamed', (event) => {
    const { oldPath, newPath } = event
    const oldState = fileStates.get(oldPath)
    if (oldState) {
      fileStates.set(newPath, oldState)
      fileStates.delete(oldPath)
    }

    viewStateStore.renameViewState(oldPath, newPath)
  })

  const stopFileRemovedListener = fileSystemEvents.on('file:removed', (event) => {
    fileStates.delete(event.path)
    viewStateStore.removeViewState(event.path)

    modelAccessCache.delete(event.path)

    const uri = monaco.Uri.parse(event.path)
    const model = monaco.editor.getModel(uri)
    if (model) {
      model.dispose()
    }
  })

  const stopWatchingTabs = useTabsWatcher((closedPath) => {
    saveViewState(closedPath)
    fileStates.delete(closedPath)
  })

  function disposeWorkspaceListeners() {
    stopWatchingTabs()
    stopFileRenamedListener()
    stopFileRemovedListener()
  }

  tryOnUnmounted(disposeWorkspaceListeners)
  useEventListener(globalThis, 'pagehide', flushCurrentViewState)
  useEventListener(globalThis, 'beforeunload', flushCurrentViewState)

  function readEditor(): monaco.editor.IStandaloneCodeEditor | undefined {
    return options.editorRef.value
  }

  function readCurrentEditorPath(): string | undefined {
    return readEditor()?.getModel()?.uri.toString()
  }

  function flushCurrentViewState() {
    const path = readCurrentEditorPath()
    if (!path) {
      return
    }

    saveViewState(path, { persistSessionRecovery: true })
  }

  function getOrCreateFileState(path: string): FileWorkspaceState {
    let fileState = fileStates.get(path)
    if (!fileState) {
      fileState = {}
      fileStates.set(path, fileState)
    }
    return fileState
  }

  function ensureModel(value: string, language: string, path: string): monaco.editor.ITextModel {
    const uri = monaco.Uri.parse(path)
    let model = monaco.editor.getModel(uri)

    if (model) {
      if (model.getValue() !== value) {
        model.setValue(value)
      }
      if (model.getLanguageId() !== language) {
        monaco.editor.setModelLanguage(model, language)
      }
    } else {
      model = monaco.editor.createModel(value, language, uri)
    }

    modelAccessCache.set(path, true)

    return model
  }

  function saveViewState(
    path: string,
    options_: {
      persistSessionRecovery?: boolean
    } = {},
  ) {
    const shouldPersist = options.shouldPersistPersistentViewState(path)
    const persistViewState = (viewState: monaco.editor.ICodeEditorViewState | null | undefined) => {
      if (!viewState) {
        return
      }
      if (shouldPersist) {
        viewStateStore.savePersistentViewState(path, viewState)
      }
      if (options_.persistSessionRecovery) {
        viewStateStore.saveSessionRecoveryViewState(path, viewState)
      }
    }

    const editor = readEditor()
    if (!editor) {
      persistViewState(fileStates.get(path)?.viewState)
      return
    }

    if (editor.getModel()?.uri.toString() !== path) {
      persistViewState(fileStates.get(path)?.viewState)
      return
    }

    const currentViewState = normalizeEditorViewState(
      editor.saveViewState(),
      editor.getSelections(),
    )
    if (!currentViewState) {
      return
    }

    getOrCreateFileState(path).viewState = currentViewState
    persistViewState(currentViewState)
  }

  function restoreViewState(path: string, context: RestoreViewStateContext = {}) {
    const editor = readEditor()
    if (!editor) {
      return
    }

    const fileState = getOrCreateFileState(path)

    let viewStateToRestore = fileState.viewState
    let hasPersistedViewState = false

    if (!viewStateToRestore) {
      viewStateToRestore = viewStateStore.consumeSessionRecoveryViewState(path)
      if (viewStateToRestore) {
        fileState.viewState = viewStateToRestore
        hasPersistedViewState = true
      }
    }

    if (!viewStateToRestore) {
      viewStateToRestore = viewStateStore.getPersistentViewState(path)
      if (viewStateToRestore) {
        fileState.viewState = viewStateToRestore
        hasPersistedViewState = true
      }
    }

    if (viewStateToRestore) {
      editor.restoreViewState(viewStateToRestore)
    }

    options.initializeSceneSelectionFromRestoredCursor()

    if (shouldRestoreTextEditorFocus({
      ...context,
      fileState,
      hasCreatedEditorBefore,
      hasPersistedViewState,
      isPreview: options.isCurrentTabPreview(),
      shouldFocusRequested: tabsStore.shouldFocusEditor,
    })) {
      if (tabsStore.shouldFocusEditor) {
        tabsStore.shouldFocusEditor = false
      }
      options.focusEditor()
    }
  }

  function markFileInteracted(path: string) {
    getOrCreateFileState(path).hasUserInteracted = true
  }

  function markFileOpened(path: string) {
    if (!options.isCurrentTabPreview()) {
      getOrCreateFileState(path).hasBeenOpened = true
    }
  }

  function markEditorCreated() {
    hasCreatedEditorBefore = true
  }

  function switchModel(options_: SwitchModelOptions) {
    const editor = readEditor()
    if (!editor) {
      return
    }

    saveViewState(options_.oldPath)

    const oldFileState = getOrCreateFileState(options_.oldPath)
    const oldTab = tabsStore.tabs.find(tab => tab.path === options_.oldPath)
    if (oldTab && !oldTab.isPreview) {
      oldFileState.hasBeenOpened = true
    } else if (!oldTab) {
      oldFileState.hasUserInteracted = false
    }

    editor.setModel(ensureModel(options_.value, options_.language, options_.newPath))

    markFileOpened(options_.newPath)
    restoreViewState(options_.newPath, { isSwitching: true })

    if (options_.oldPath !== options_.newPath && modelAccessCache.has(options_.oldPath)) {
      modelAccessCache.delete(options_.oldPath)
    }
  }

  function syncCurrentModelLanguage(language: string) {
    const model = readEditor()?.getModel()
    if (model && model.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(model, language)
    }
  }

  return {
    ensureModel,
    markEditorCreated,
    markFileInteracted,
    markFileOpened,
    restoreViewState,
    saveViewState,
    switchModel,
    syncCurrentModelLanguage,
  }
}
