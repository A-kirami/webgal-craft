import { RelPath } from '~/domain/path'

export type AssetRoot = 'asset' | 'scene'

export interface AssetKey {
  root: AssetRoot
  assetType: string
  relativePath: RelPath
}

export function createAssetKey(
  root: AssetRoot,
  assetType: string,
  relativePath: RelPath,
): AssetKey {
  return {
    root,
    assetType,
    relativePath,
  }
}

export function createAssetKeyForType(assetType: string, relativePath: RelPath): AssetKey {
  return createAssetKey(assetType === 'scene' ? 'scene' : 'asset', assetType, relativePath)
}

export function stringifyAssetKey(key: AssetKey): string {
  return `${key.root}\0${key.assetType}\0${key.relativePath}`
}
