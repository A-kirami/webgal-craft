import type { AbsPath, RelPath } from '~/domain/path'

declare const LookupBrand: unique symbol

export type LookupPathKey = string & { readonly [LookupBrand]: true }

export function toLookupPathKey(path: AbsPath | RelPath): LookupPathKey {
  // eslint-disable-next-line no-restricted-syntax -- LookupPathKey 只能由显式派生函数构造。
  return path.toLowerCase() as LookupPathKey
}

export function caseFoldedEquals(
  left: AbsPath | RelPath,
  right: AbsPath | RelPath,
): boolean {
  return toLookupPathKey(left) === toLookupPathKey(right)
}
