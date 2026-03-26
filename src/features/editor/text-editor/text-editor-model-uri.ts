export interface ResolveTextEditorWorkspacePathOptions {
  activeTabPath?: string
  modelUri?: string
  openTabPaths: Iterable<string>
  trackedPaths: Iterable<string>
}

export function toTextEditorWorkspacePath(modelUri: string | undefined): string | undefined {
  if (!modelUri) {
    return
  }

  try {
    return decodeURIComponent(modelUri)
  } catch {
    return modelUri
  }
}

export function isTextEditorModelPath(modelUri: string | undefined, path: string): boolean {
  return toTextEditorWorkspacePath(modelUri) === path
}

function findTextEditorWorkspacePath(
  workspacePath: string | undefined,
  candidatePaths: Iterable<string>,
): string | undefined {
  if (!workspacePath) {
    return
  }

  for (const path of candidatePaths) {
    if (path === workspacePath) {
      return path
    }
  }
}

export function resolveTextEditorWorkspacePath(
  options: ResolveTextEditorWorkspacePathOptions,
): string | undefined {
  const workspacePath = toTextEditorWorkspacePath(options.modelUri)

  if (options.activeTabPath === workspacePath) {
    return options.activeTabPath
  }

  return findTextEditorWorkspacePath(workspacePath, options.trackedPaths)
    ?? findTextEditorWorkspacePath(workspacePath, options.openTabPaths)
}
