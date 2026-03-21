export interface AssetUrlOptions {
  cwd: string
  previewBaseUrl: string
}

/** 将绝对资源路径转换为可访问的预览服务 URL */
export function resolveAssetUrl(path: string, options: AssetUrlOptions): string {
  const normalizedCwd = options.cwd.replaceAll('\\', '/').replace(/\/$/, '')
  const normalizedPath = path.replaceAll('\\', '/')

  if (!normalizedCwd) {
    throw new Error('工作区未初始化，无法构建资源预览地址')
  }

  if (!options.previewBaseUrl) {
    throw new Error('预览地址不存在，请先启动预览')
  }

  if (!(normalizedPath === normalizedCwd || normalizedPath.startsWith(`${normalizedCwd}/`))) {
    throw new Error(`资源路径不在当前工作区内: ${path}`)
  }

  const relativePath = normalizedPath.slice(normalizedCwd.length).replace(/^\//, '')
  return new URL(relativePath, options.previewBaseUrl).href
}

export function getAssetUrl(path: string): string {
  const workspaceStore = useWorkspaceStore()
  return resolveAssetUrl(path, {
    cwd: workspaceStore.CWD ?? '',
    previewBaseUrl: workspaceStore.currentGameServeUrl ?? '',
  })
}
