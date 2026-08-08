import { AbsPath } from '~/domain/path'
import { gameRootDir } from '~/services/platform/app-paths'

export interface EditorTabPathIdentity {
  name: string
  path: AbsPath
  resourceRootPath?: AbsPath
}

type PathSegments = readonly string[]

/**
 * 为同名标签页计算足以区分它们的父路径后缀。
 *
 * 只展示从文件所在目录向上数的最短唯一路径，避免把完整绝对路径带进标签页。
 */
export function getEditorTabPathHints(
  tabs: readonly EditorTabPathIdentity[],
): ReadonlyMap<AbsPath, string> {
  const tabsByName = new Map<string, EditorTabPathIdentity[]>()

  for (const tab of tabs) {
    const sameNameTabs = tabsByName.get(tab.name)
    if (sameNameTabs) {
      sameNameTabs.push(tab)
    } else {
      tabsByName.set(tab.name, [tab])
    }
  }

  const pathHints = new Map<AbsPath, string>()
  for (const sameNameTabs of tabsByName.values()) {
    if (sameNameTabs.length < 2) {
      continue
    }

    const sharedResourceRootPath = getSharedResourceRootPath(sameNameTabs)
    const parentPaths = sameNameTabs.map(tab => getDisplayParentPathSegments(tab, sharedResourceRootPath))
    const depth = findMinimumUniqueSuffixDepth(parentPaths)

    for (const [index, tab] of sameNameTabs.entries()) {
      const parentPath = parentPaths[index]
      pathHints.set(tab.path, createPathHint(parentPath, depth))
    }
  }

  return pathHints
}

/**
 * 根据游戏工程路径识别文档所属的资源根目录。
 *
 * 场景和资产都位于 game 目录的一级子目录下，标签提示只在该资源根内展示相对路径。
 */
export function getEditorTabResourceRootPath(path: AbsPath, gamePath?: AbsPath): AbsPath | undefined {
  if (!gamePath) {
    return
  }

  const gameRootPath = gameRootDir(gamePath)
  let relativePath: string
  try {
    relativePath = AbsPath.relativize(path, gameRootPath)
  } catch {
    return
  }

  const segments = relativePath.split('/').filter(Boolean)
  return segments.length > 1 ? AbsPath.append(gameRootPath, segments[0]!) : gameRootPath
}

function getSharedResourceRootPath(tabs: readonly EditorTabPathIdentity[]): AbsPath | undefined {
  const resourceRootPath = tabs[0]?.resourceRootPath
  if (!resourceRootPath || tabs.some(tab => tab.resourceRootPath !== resourceRootPath)) {
    return
  }

  return resourceRootPath
}

function getDisplayParentPathSegments(
  tab: EditorTabPathIdentity,
  sharedResourceRootPath?: AbsPath,
): PathSegments {
  if (sharedResourceRootPath) {
    return getRelativeParentPathSegments(tab.path, sharedResourceRootPath) ?? getAbsoluteParentPathSegments(tab.path)
  }

  if (tab.resourceRootPath) {
    const relativeParentPath = getRelativeParentPathSegments(tab.path, tab.resourceRootPath)
    if (relativeParentPath) {
      return [AbsPath.basename(tab.resourceRootPath), ...relativeParentPath]
    }
  }

  return getAbsoluteParentPathSegments(tab.path)
}

function getRelativeParentPathSegments(path: AbsPath, rootPath: AbsPath): PathSegments | undefined {
  try {
    const relativePath = AbsPath.relativize(AbsPath.parent(path), rootPath)
    return relativePath.split('/').filter(Boolean)
  } catch {
    return
  }
}

function getAbsoluteParentPathSegments(path: AbsPath): PathSegments {
  const segments = path.split('/').filter(Boolean)
  if (path.startsWith('/')) {
    segments.unshift('/')
  }
  segments.pop()
  return segments
}

function findMinimumUniqueSuffixDepth(paths: readonly PathSegments[]): number {
  const maximumDepth = Math.max(...paths.map(path => path.length), 1)

  for (let depth = 1; depth <= maximumDepth; depth++) {
    const suffixes = paths.map(path => getPathSuffix(path, depth))
    if (new Set(suffixes).size === suffixes.length) {
      return depth
    }
  }

  return maximumDepth
}

function getPathSuffix(path: PathSegments, depth: number): string {
  return path.slice(-depth).join('/')
}

function createPathHint(path: PathSegments, depth: number): string {
  const suffix = getPathSuffix(path, depth)
  if (!suffix || suffix === '/') {
    return './'
  }

  return depth < path.length ? `.../${suffix}` : suffix
}
