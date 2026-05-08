import { RelPath } from '~/domain/path'

import { createAssetKeyForType } from './keys'

import type { AssetKey } from './keys'

function isVariableResourceReference(value: string): boolean {
  const trimmed = value.trim()
  return /^\{[^{}]+\}$/.test(trimmed)
}

export function shouldIndexAssetReferenceValue(assetType: string, value: string): boolean {
  if (!value || isVariableResourceReference(value)) {
    return false
  }

  // scene 中不带 .txt 的值可能是 label，而不是文件路径。
  if (assetType === 'scene' && !value.endsWith('.txt')) {
    return false
  }

  return true
}

export function createReferencedAssetKey(assetType: string, value: string): AssetKey | undefined {
  if (!shouldIndexAssetReferenceValue(assetType, value)) {
    return
  }

  try {
    return createAssetKeyForType(assetType, RelPath.from(value))
  } catch {
    return
  }
}
