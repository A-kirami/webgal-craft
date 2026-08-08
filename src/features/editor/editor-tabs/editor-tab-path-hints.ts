import { AbsPath } from '~/domain/path'

export interface EditorTabPathIdentity {
  name: string
  path: AbsPath
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

    const parentPaths = sameNameTabs.map(tab => getParentPathSegments(tab.path))
    const depth = findMinimumUniqueSuffixDepth(parentPaths)

    for (const [index, tab] of sameNameTabs.entries()) {
      const parentPath = parentPaths[index]
      if (parentPath) {
        pathHints.set(tab.path, getPathSuffix(parentPath, depth))
      }
    }
  }

  return pathHints
}

function getParentPathSegments(path: AbsPath): PathSegments {
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
