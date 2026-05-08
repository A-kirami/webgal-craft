import { RelPath } from '~/domain/path'

import { createAssetKeyForType } from './keys'

import type { AssetKey } from './keys'

function isVariableResourceReference(value: string): boolean {
  const trimmed = value.trim()
  return /^\{[^{}]+\}$/.test(trimmed)
}

export function shouldIndexAssetReferenceValue(assetType: string, value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || isVariableResourceReference(trimmed)) {
    return false
  }

  // scene 中不带 .txt 的值可能是 label，而不是文件路径。
  if (assetType === 'scene' && !trimmed.toLowerCase().endsWith('.txt')) {
    return false
  }

  return true
}

export function createReferencedAssetKey(assetType: string, value: string): AssetKey | undefined {
  const trimmed = value.trim()
  if (!shouldIndexAssetReferenceValue(assetType, trimmed)) {
    return
  }

  try {
    return createAssetKeyForType(assetType, RelPath.from(trimmed))
  } catch {
    return
  }
}
