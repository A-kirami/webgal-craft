export function getRelativePath(path: string, basePath?: string): string {
  const workspaceStore = useWorkspaceStore()
  const base = basePath ?? workspaceStore.CWD
  if (!base) {
    return path
  }
  return path.replace(base, '')
}

export function getAssetUrl(path: string) {
  const relativePath = getRelativePath(path)
  const workspaceStore = useWorkspaceStore()
  const normalizedPath = relativePath.replaceAll('\\', '/').replace(/^\//, '')
  return new URL(normalizedPath, workspaceStore.currentGamePreviewUrl).href
}
