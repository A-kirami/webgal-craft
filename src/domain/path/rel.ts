import {
  assertRelativePath,
  assertSegment,
  normalizePosix,
  PathError,
} from './normalize'

declare const RelBrand: unique symbol

export type RelPath = string & { readonly [RelBrand]: true }

function createRelPath(value: string): RelPath {
  // eslint-disable-next-line no-restricted-syntax -- brand 工厂是唯一允许的构造入口。
  return value as RelPath
}

function ensureValidRelPath(raw: string): string {
  const normalized = normalizePosix(raw).replace(/^\/+/, '').replace(/\/+$/, '')
  if (normalized === '') {
    return ''
  }
  assertRelativePath(normalized)
  if (normalized.includes('/../') || normalized.endsWith('/..')) {
    throw new PathError(`相对路径不能越界: ${raw}`)
  }
  return normalized
}

export namespace RelPath {
  export function from(raw: string): RelPath {
    return createRelPath(ensureValidRelPath(raw))
  }

  export function empty(): RelPath {
    return createRelPath('')
  }

  export function append(path: RelPath, segment: string): RelPath {
    assertSegment(segment)
    return createRelPath(ensureValidRelPath(path ? `${path}/${segment}` : segment))
  }

  export function parent(path: RelPath): RelPath {
    const lastSlash = path.lastIndexOf('/')
    return createRelPath(lastSlash === -1 ? '' : path.slice(0, lastSlash))
  }

  export function basename(path: RelPath): string {
    const lastSlash = path.lastIndexOf('/')
    return lastSlash === -1 ? path : path.slice(lastSlash + 1)
  }

  export function startsWith(path: RelPath, prefix: RelPath): boolean {
    if (!prefix) {
      return true
    }
    return path === prefix || path.startsWith(`${prefix}/`)
  }

  export function equals(left: RelPath, right: RelPath): boolean {
    return left === right
  }
}
