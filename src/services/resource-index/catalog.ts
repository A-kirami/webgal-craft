import { readDir } from '@tauri-apps/plugin-fs'

import { AbsPath, RelPath } from '~/domain/path'

export interface AssetCatalogSnapshot {
  assetFiles: Map<string, Set<RelPath>>
}

export function createEmptyAssetCatalogSnapshot(): AssetCatalogSnapshot {
  return {
    assetFiles: new Map<string, Set<RelPath>>(),
  }
}

export function cloneAssetCatalogSnapshot(snapshot: AssetCatalogSnapshot): AssetCatalogSnapshot {
  return {
    assetFiles: new Map(
      Array.from(snapshot.assetFiles.entries(), ([assetType, files]) => [assetType, new Set(files)]),
    ),
  }
}

export function hasAssetInCatalog(
  snapshot: AssetCatalogSnapshot,
  assetType: string,
  relativePath: RelPath,
): boolean {
  const files = snapshot.assetFiles.get(assetType)
  if (!files) {
    return false
  }
  return files.has(relativePath)
}

export async function buildAssetCatalog(gamePath: AbsPath): Promise<AssetCatalogSnapshot> {
  const gameRootPath = AbsPath.append(gamePath, 'game')
  const rootEntries = await readDir(gameRootPath)
  const assetDirectories = rootEntries.filter(entry => entry.isDirectory && !!entry.name)
  const assetFiles = await Promise.all(assetDirectories.map(async (entry) => {
    const assetType = entry.name!
    const rootPath = AbsPath.append(gameRootPath, assetType)
    const files = await collectAssetFiles(rootPath, RelPath.empty())
    return [assetType, files] as const
  }))

  return {
    assetFiles: new Map(assetFiles),
  }
}

export function addAssetPathToCatalog(
  snapshot: AssetCatalogSnapshot,
  gamePath: AbsPath,
  absolutePath: AbsPath,
): AssetCatalogSnapshot {
  const resolved = resolveCatalogPath(gamePath, absolutePath)
  if (!resolved) {
    return snapshot
  }

  const nextSnapshot = cloneAssetCatalogSnapshot(snapshot)
  const files = nextSnapshot.assetFiles.get(resolved.assetType) ?? new Set<RelPath>()
  files.add(resolved.relativePath)
  nextSnapshot.assetFiles.set(resolved.assetType, files)
  return nextSnapshot
}

export function removeAssetPathFromCatalog(
  snapshot: AssetCatalogSnapshot,
  gamePath: AbsPath,
  absolutePath: AbsPath,
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
  gamePath: AbsPath,
  oldPath: AbsPath,
  newPath: AbsPath,
): AssetCatalogSnapshot {
  const withoutOldPath = removeAssetPathFromCatalog(snapshot, gamePath, oldPath)
  return addAssetPathToCatalog(withoutOldPath, gamePath, newPath)
}

export function isPathWithinGameRoot(gamePath: AbsPath, path: AbsPath): boolean {
  const gameRootPath = AbsPath.append(gamePath, 'game')
  return path === gameRootPath || path.startsWith(`${gameRootPath}/`)
}

async function collectAssetFiles(
  directoryPath: AbsPath,
  relativePrefix: RelPath,
): Promise<Set<RelPath>> {
  const entries = await readDir(directoryPath)
  const nestedFiles = await Promise.all(entries.flatMap((entry) => {
    if (!entry.name) {
      return []
    }

    const relativePath = RelPath.append(relativePrefix, entry.name)

    if (entry.isDirectory) {
      return [collectAssetFiles(AbsPath.append(directoryPath, entry.name), relativePath)]
    }

    return [Promise.resolve(new Set([relativePath]))]
  }))

  return new Set(nestedFiles.flatMap(files => [...files]))
}

function resolveCatalogPath(gamePath: AbsPath, absolutePath: AbsPath): {
  assetType: string
  relativePath: RelPath
} | undefined {
  const gameRootPath = AbsPath.append(gamePath, 'game')
  if (!absolutePath.startsWith(`${gameRootPath}/`)) {
    return
  }

  const relativeToGameRoot = AbsPath.relativize(absolutePath, gameRootPath)
  if (!relativeToGameRoot) {
    return
  }
  const segments = relativeToGameRoot.split('/').filter(Boolean)
  if (segments.length < 2) {
    return
  }

  return {
    assetType: segments[0],
    relativePath: RelPath.from(segments.slice(1).join('/')),
  }
}
