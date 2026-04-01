import type { FileTreeDefaultFileNameParts } from '~/features/editor/file-tree/file-tree'

const assetFileExtensionByType = {
  animation: '.json',
  template: '.scss',
} as const

function resolveAssetFileExtension(assetType: string): string | undefined {
  if (!Object.hasOwn(assetFileExtensionByType, assetType)) {
    return
  }

  return assetFileExtensionByType[assetType as keyof typeof assetFileExtensionByType]
}

export function resolveAssetFileNameParts(
  assetType: string,
  stem: string,
): FileTreeDefaultFileNameParts | undefined {
  const extension = resolveAssetFileExtension(assetType)
  if (!extension) {
    return
  }

  return {
    extension,
    stem,
  }
}

export function canCreateAssetFile(assetType: string): boolean {
  return resolveAssetFileExtension(assetType) !== undefined
}
