/** 将绝对资源路径转换为可访问的预览服务 URL */
export function getAssetUrl(path: string): string {
  const workspaceStore = useWorkspaceStore()
  const relativePath = path.replace(workspaceStore.CWD ?? '', '')
  const normalizedPath = relativePath.replaceAll('\\', '/').replace(/^\//, '')
  return new URL(normalizedPath, workspaceStore.currentGameServeUrl).href
}
