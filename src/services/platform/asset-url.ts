import { useWorkspaceStore } from '~/stores/workspace'

export interface AssetThumbnailOptions {
  width: number
  height: number
  resizeMode?: 'contain' | 'cover'
}

export interface AssetUrlOptions {
  cwd: string
  previewBaseUrl: string
  cacheVersion?: number
  thumbnail?: AssetThumbnailOptions
}

interface ResolvedPath {
  root: string
  segments: string[]
  escapedBase?: boolean
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
      root: `${windowsDriveMatch[1].toUpperCase()}/`,
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
  const minSegmentDepth = parsedPath.root ? 0 : (basePath?.segments.length ?? 0)
  const resolvedPath: ResolvedPath = {
    root: parsedPath.root || basePath?.root || '',
    escapedBase: false,
    segments: parsedPath.root ? [] : [...(basePath?.segments ?? [])],
  }

  for (const segment of parsedPath.segments) {
    if (segment === '.' || !segment) {
      continue
    }

    if (segment === '..') {
      if (resolvedPath.segments.length > minSegmentDepth) {
        resolvedPath.segments.pop()
      } else {
        resolvedPath.escapedBase = true
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

function appendThumbnailQuery(url: URL, thumbnail: AssetThumbnailOptions | undefined) {
  if (!thumbnail) {
    return
  }

  url.searchParams.set('w', String(thumbnail.width))
  url.searchParams.set('h', String(thumbnail.height))

  if (thumbnail.resizeMode) {
    url.searchParams.set('fit', thumbnail.resizeMode)
  }
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

  if (resolvedPath.escapedBase || !isSubPath(resolvedCwd, resolvedPath)) {
    throw new Error(`资源路径不在当前工作区内: ${assetPath}`)
  }

  const relativePath = resolvedPath.segments.slice(resolvedCwd.segments.length).join('/')
  const url = new URL(relativePath, options.previewBaseUrl)
  if (options.cacheVersion !== undefined) {
    url.searchParams.set('t', String(options.cacheVersion))
  }
  appendThumbnailQuery(url, options.thumbnail)
  return url.href
}

export function getAssetUrl(
  assetPath: string,
  cacheVersion?: number,
  serveUrl?: string,
  thumbnail?: AssetThumbnailOptions,
): string {
  const workspaceStore = useWorkspaceStore()
  return resolveAssetUrl(assetPath, {
    cwd: workspaceStore.CWD ?? '',
    cacheVersion,
    previewBaseUrl: serveUrl ?? workspaceStore.currentGameServeUrl ?? '',
    thumbnail,
  })
}
