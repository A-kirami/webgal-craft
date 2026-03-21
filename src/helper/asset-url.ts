export interface AssetUrlOptions {
  cwd: string
  previewBaseUrl: string
}

interface ResolvedPath {
  root: string
  segments: string[]
}

function normalizeFsPath(input: string): string {
  return input.replaceAll('\\', '/')
}

function parsePath(input: string): ResolvedPath {
  const normalizedPath = normalizeFsPath(input)
  const uncMatch = normalizedPath.match(/^\/\/([^/]+)\/([^/]+)(?:\/(.*))?$/)
  if (uncMatch) {
    return {
      root: `//${uncMatch[1]}/${uncMatch[2]}/`,
      segments: uncMatch[3]?.split('/').filter(Boolean) ?? [],
    }
  }

  const windowsDriveMatch = normalizedPath.match(/^([A-Za-z]:)(?:\/(.*))?$/)
  if (windowsDriveMatch) {
    return {
      root: `${windowsDriveMatch[1]}/`,
      segments: windowsDriveMatch[2]?.split('/').filter(Boolean) ?? [],
    }
  }

  if (normalizedPath.startsWith('/')) {
    return {
      root: '/',
      segments: normalizedPath.slice(1).split('/').filter(Boolean),
    }
  }

  return {
    root: '',
    segments: normalizedPath.split('/').filter(Boolean),
  }
}

function resolvePath(input: string, basePath?: ResolvedPath): ResolvedPath {
  const parsedPath = parsePath(input)
  const resolvedPath: ResolvedPath = {
    root: parsedPath.root || basePath?.root || '',
    segments: parsedPath.root ? [] : [...(basePath?.segments ?? [])],
  }

  for (const segment of parsedPath.segments) {
    if (segment === '.' || !segment) {
      continue
    }

    if (segment === '..') {
      if (resolvedPath.segments.length > 0) {
        resolvedPath.segments.pop()
      }
      continue
    }

    resolvedPath.segments.push(segment)
  }

  return resolvedPath
}

function isSubPath(parentPath: ResolvedPath, childPath: ResolvedPath): boolean {
  return parentPath.root === childPath.root
    && parentPath.segments.length <= childPath.segments.length
    && parentPath.segments.every((segment, index) => childPath.segments[index] === segment)
}

/** 将绝对资源路径转换为可访问的预览服务 URL */
export function resolveAssetUrl(assetPath: string, options: AssetUrlOptions): string {
  const resolvedCwd = resolvePath(options.cwd)

  if (!resolvedCwd.root) {
    throw new Error('工作区未初始化，无法构建资源预览地址')
  }

  if (!options.previewBaseUrl) {
    throw new Error('预览地址不存在，请先启动预览')
  }

  const resolvedPath = resolvePath(assetPath, resolvedCwd)

  if (!isSubPath(resolvedCwd, resolvedPath)) {
    throw new Error(`资源路径不在当前工作区内: ${assetPath}`)
  }

  const relativePath = resolvedPath.segments.slice(resolvedCwd.segments.length).join('/')
  return new URL(relativePath, options.previewBaseUrl).href
}

export function getAssetUrl(assetPath: string): string {
  const workspaceStore = useWorkspaceStore()
  return resolveAssetUrl(assetPath, {
    cwd: workspaceStore.CWD ?? '',
    previewBaseUrl: workspaceStore.currentGameServeUrl ?? '',
  })
}
