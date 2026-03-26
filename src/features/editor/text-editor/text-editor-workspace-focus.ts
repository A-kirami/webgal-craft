export interface TextEditorWorkspaceFileState {
  viewState?: unknown
  hasBeenOpened?: boolean
  hasUserInteracted?: boolean
}

export interface TextEditorWorkspaceFocusContext {
  fileState: TextEditorWorkspaceFileState
  hasCreatedEditorBefore: boolean
  hasPersistedViewState?: boolean
  isCreating?: boolean
  isPreview: boolean
  isSwitching?: boolean
  shouldFocusRequested?: boolean
}

export function shouldRestoreTextEditorFocus(context: TextEditorWorkspaceFocusContext): boolean {
  if (context.shouldFocusRequested) {
    return true
  }

  const hasViewState = context.fileState.viewState !== undefined || context.hasPersistedViewState === true

  if (context.isCreating) {
    return !context.isPreview && !context.hasCreatedEditorBefore && hasViewState
  }

  if (context.isSwitching) {
    return context.isPreview
      ? context.fileState.hasUserInteracted === true
      : hasViewState || context.fileState.hasBeenOpened === true
  }

  return false
}
