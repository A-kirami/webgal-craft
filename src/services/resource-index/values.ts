import { RelPath } from '~/domain/path'
import { hasVariableInterpolation } from '~/domain/script/variable-interpolation'

import { createAssetKeyForType } from './keys'

import type { AssetKey } from './keys'

/**
 * 含变量插值的取值在运行时才成形，索引不到具体资源；
 * 未闭合的花括号是字面文本，仍按普通路径处理。
 */
function isVariableResourceReference(trimmedValue: string): boolean {
  return hasVariableInterpolation(trimmedValue)
}

function normalizeResourceReferencePath(assetType: string, value: string): string {
  const path = value.trim().split('?', 1)[0]?.trim() ?? ''
  if (assetType === 'animation' && path && !path.endsWith('.json')) {
    return `${path}.json`
  }
  return path
}

export function shouldIndexAssetReferenceValue(assetType: string, value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || isVariableResourceReference(trimmed)) {
    return false
  }

  const resourcePath = normalizeResourceReferencePath(assetType, trimmed)
  if (!resourcePath) {
    return false
  }

  // scene 中不带 .txt 的值可能是 label，而不是文件路径。
  if (assetType === 'scene' && !resourcePath.toLowerCase().endsWith('.txt')) {
    return false
  }

  return true
}

export function createReferencedAssetKey(assetType: string, value: string): AssetKey | undefined {
  if (!shouldIndexAssetReferenceValue(assetType, value)) {
    return
  }

  try {
    return createAssetKeyForType(assetType, RelPath.from(normalizeResourceReferencePath(assetType, value)))
  } catch {
    return
  }
}
