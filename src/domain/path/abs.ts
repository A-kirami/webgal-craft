import {
  assertAbsolutePath,
  assertNotEmpty,
  assertSegment,
  canonicalizeDriveLetter,
  normalizePosix,
  PathError,
} from './normalize'
import { RelPath } from './rel'

declare const AbsBrand: unique symbol

export type AbsPath = string & { readonly [AbsBrand]: true }

function createAbsPath(value: string): AbsPath {
  // eslint-disable-next-line no-restricted-syntax -- brand 工厂是唯一允许的构造入口。
  return value as AbsPath
}

function ensureValidAbsPath(value: string): string {
  const normalized = canonicalizeDriveLetter(normalizePosix(value))
  assertNotEmpty(normalized, '绝对路径')
  assertAbsolutePath(normalized)
  if (normalized.includes('/../') || normalized.endsWith('/..') || normalized === '..') {
    throw new PathError(`绝对路径不能包含越界段: ${value}`)
  }
  return normalized
}

function getRootPrefix(path: string): string | undefined {
  return path.match(/^(\/\/[^/]+\/[^/]+|[a-zA-Z]:\/|\/)/)?.[1]
}

function getParentString(path: string): string {
  const rootPrefix = getRootPrefix(path)
  if (!rootPrefix || path === rootPrefix) {
    return path
  }
  const lastSlash = path.lastIndexOf('/')
  if (lastSlash < rootPrefix.length) {
    return rootPrefix
  }
  return path.slice(0, lastSlash)
}

export namespace AbsPath {
  export function from(raw: string): AbsPath {
    return createAbsPath(ensureValidAbsPath(raw))
  }

  export function join(root: AbsPath, relative: RelPath): AbsPath {
    if (!relative) {
      return root
    }
    return createAbsPath(ensureValidAbsPath(`${root}/${relative}`))
  }

  export function append(path: AbsPath, segment: string): AbsPath {
    assertSegment(segment)
    return createAbsPath(ensureValidAbsPath(`${path}/${segment}`))
  }

  export function parent(path: AbsPath): AbsPath {
    return createAbsPath(getParentString(path))
  }

  export function basename(path: AbsPath): string {
    if (getParentString(path) === path) {
      return ''
    }
    return path.slice(path.lastIndexOf('/') + 1)
  }

  export function relativize(path: AbsPath, root: AbsPath): RelPath {
    if (path === root) {
      return RelPath.empty()
    }
    const prefix = root.endsWith('/') ? root : `${root}/`
    if (!path.startsWith(prefix)) {
      throw new PathError(`路径不在根目录下: ${path}`)
    }
    return RelPath.from(path.slice(prefix.length))
  }

  export function equals(left: AbsPath, right: AbsPath): boolean {
    return left === right
  }
}
