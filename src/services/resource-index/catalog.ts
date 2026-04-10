import { join } from '@tauri-apps/api/path'
import { readDir } from '@tauri-apps/plugin-fs'

import { normalizeRelativePath, toComparablePath } from '~/utils/path'

export interface AssetCatalogSnapshot {
  assetFiles: Map<string, Set<string>>
}

export function createEmptyAssetCatalogSnapshot(): AssetCatalogSnapshot {
  return {
    assetFiles: new Map<string, Set<string>>(),
  }
}

export function cloneAssetCatalogSnapshot(snapshot: AssetCatalogSnapshot): AssetCatalogSnapshot {
  return {
    assetFiles: new Map(
      Array.from(snapshot.assetFiles.entries(), ([assetType, files]) => [assetType, new Set(files)]),
    ),
  }
}

export function toComparableRelativeAssetPath(path: string): string {
  return toComparablePath(normalizeRelativePath(path))
}

export function hasAssetInCatalog(
  snapshot: AssetCatalogSnapshot,
  assetType: string,
  relativePath: string,
): boolean {
  const files = snapshot.assetFiles.get(assetType)
  if (!files) {
    return false
  }
  return files.has(toComparableRelativeAssetPath(relativePath))
}

export async function buildAssetCatalog(gamePath: string): Promise<AssetCatalogSnapshot> {
  const gameRootPath = await join(gamePath, 'game')
  const rootEntries = await readDir(gameRootPath)
  const assetDirectories = rootEntries.filter(entry => entry.isDirectory && !!entry.name)
  const assetFiles = await Promise.all(assetDirectories.map(async (entry) => {
    const assetType = entry.name!
    const rootPath = await join(gameRootPath, assetType)
    const files = await collectAssetFiles(rootPath, '')
    return [assetType, files] as const
  }))

  return {
    assetFiles: new Map(assetFiles),
  }
}

export function addAssetPathToCatalog(
  snapshot: AssetCatalogSnapshot,
  gamePath: string,
  absolutePath: string,
): AssetCatalogSnapshot {
  const resolved = resolveCatalogPath(gamePath, absolutePath)
  if (!resolved) {
    return snapshot
  }

  const nextSnapshot = cloneAssetCatalogSnapshot(snapshot)
  const files = nextSnapshot.assetFiles.get(resolved.assetType) ?? new Set<string>()
  files.add(resolved.relativePath)
  nextSnapshot.assetFiles.set(resolved.assetType, files)
  return nextSnapshot
}

export function removeAssetPathFromCatalog(
  snapshot: AssetCatalogSnapshot,
  gamePath: string,
  absolutePath: string,
): AssetCatalogSnapshot {
  const resolved = resolveCatalogPath(gamePath, absolutePath)
  if (!resolved) {
    return snapshot
  }

  const files = snapshot.assetFiles.get(resolved.assetType)
  if (!files?.has(resolved.relativePath)) {
    return snapshot
  }

  const nextSnapshot = cloneAssetCatalogSnapshot(snapshot)
  nextSnapshot.assetFiles.get(resolved.assetType)?.delete(resolved.relativePath)
  return nextSnapshot
}

export function renameAssetPathInCatalog(
  snapshot: AssetCatalogSnapshot,
  gamePath: string,
  oldPath: string,
  newPath: string,
): AssetCatalogSnapshot {
  const withoutOldPath = removeAssetPathFromCatalog(snapshot, gamePath, oldPath)
  return addAssetPathToCatalog(withoutOldPath, gamePath, newPath)
}

export function isPathWithinGameRoot(gamePath: string, path: string): boolean {
  const normalizedGameRoot = `${toComparablePath(gamePath)}/game`
  const normalizedPath = toComparablePath(path)
  return normalizedPath === normalizedGameRoot || normalizedPath.startsWith(`${normalizedGameRoot}/`)
}

async function collectAssetFiles(
  directoryPath: string,
  relativePrefix: string,
): Promise<Set<string>> {
  const entries = await readDir(directoryPath)
  const nestedFiles = await Promise.all(entries.flatMap((entry) => {
    if (!entry.name) {
      return []
    }

    const relativePath = normalizeRelativePath(
      relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name,
    )

    if (entry.isDirectory) {
      return [join(directoryPath, entry.name).then(absolutePath => collectAssetFiles(absolutePath, relativePath))]
    }

    return [Promise.resolve(new Set([toComparableRelativeAssetPath(relativePath)]))]
  }))

  return new Set(nestedFiles.flatMap(files => [...files]))
}

function resolveCatalogPath(gamePath: string, absolutePath: string): {
  assetType: string
  relativePath: string
} | undefined {
  const normalizedGameRoot = `${toComparablePath(gamePath)}/game/`
  const normalizedPath = toComparablePath(absolutePath)

  if (!normalizedPath.startsWith(normalizedGameRoot)) {
    return
  }

  const relativeToGameRoot = normalizedPath.slice(normalizedGameRoot.length)
  const segments = relativeToGameRoot.split('/').filter(Boolean)
  if (segments.length < 2) {
    return
  }

  return {
    assetType: segments[0],
    relativePath: segments.slice(1).join('/'),
  }
}
