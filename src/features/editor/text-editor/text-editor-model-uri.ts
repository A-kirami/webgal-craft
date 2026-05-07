export interface ResolveTextEditorWorkspacePathOptions<TPath extends string = string> {
  activeTabPath?: TPath
  modelUri?: string
  openTabPaths: Iterable<TPath>
  trackedPaths: Iterable<TPath>
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

function findTextEditorWorkspacePath<TPath extends string>(
  workspacePath: string | undefined,
  candidatePaths: Iterable<TPath>,
): TPath | undefined {
  if (!workspacePath) {
    return
  }

  for (const path of candidatePaths) {
    if (path === workspacePath) {
      return path
    }
  }
}

export function resolveTextEditorWorkspacePath<TPath extends string>(
  options: ResolveTextEditorWorkspacePathOptions<TPath>,
): TPath | undefined {
  const workspacePath = toTextEditorWorkspacePath(options.modelUri)

  if (options.activeTabPath !== undefined && options.activeTabPath === workspacePath) {
    return options.activeTabPath
  }

  return findTextEditorWorkspacePath(workspacePath, options.trackedPaths)
    ?? findTextEditorWorkspacePath(workspacePath, options.openTabPaths)
}
