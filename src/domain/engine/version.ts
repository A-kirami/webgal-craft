import { compareVersions, validate } from 'compare-versions'

/** 去除首尾空白，空字符串视为 undefined */
function normalize(version?: string): string | undefined {
  const trimmed = version?.trim()
  return trimmed || undefined
}

export function compareEngineVersions(left?: string, right?: string): number {
  const l = normalize(left)
  const r = normalize(right)
  const lValid = l !== undefined && validate(l)
  const rValid = r !== undefined && validate(r)

  if (lValid && rValid) {
    return -compareVersions(l, r)
  }

  if (lValid !== rValid) {
    return lValid ? -1 : 1
  }

  // 两个都无效：按字典序降序回退，或都为空则相等
  if (l && r) {
    return r.localeCompare(l, undefined, { numeric: true, sensitivity: 'base' })
  }

  if (l !== r) {
    return l ? -1 : 1
  }

  return 0
}
