import { readDir } from '@tauri-apps/plugin-fs'

import { AbsPath, RelPath } from '~/domain/path'
import { gameAssetDir, gameRootDir } from '~/services/platform/app-paths'

import { createAssetKeyForType, stringifyAssetKey } from './keys'

import type { AssetKey } from './keys'

export interface AssetCatalogEntry {
  key: AssetKey
  absolutePath: AbsPath
  fileName: string
  extension: string
}

export interface AssetCatalogSnapshot {
  entries: Map<string, AssetCatalogEntry>
}

export function createEmptyAssetCatalogSnapshot(): AssetCatalogSnapshot {
  return {
    entries: new Map<string, AssetCatalogEntry>(),
  }
}

function cloneAssetCatalogSnapshot(snapshot: AssetCatalogSnapshot): AssetCatalogSnapshot {
  return {
    entries: new Map(snapshot.entries),
  }
}

export function hasAssetInCatalog(
  snapshot: AssetCatalogSnapshot,
  key: AssetKey,
): boolean {
  return snapshot.entries.has(stringifyAssetKey(key))
}

export function getAssetFromCatalog(
  snapshot: AssetCatalogSnapshot,
  key: AssetKey,
): AssetCatalogEntry | undefined {
  return snapshot.entries.get(stringifyAssetKey(key))
}

export function resolveAssetByAbsolutePath(
  snapshot: AssetCatalogSnapshot,
  absolutePath: AbsPath,
): AssetCatalogEntry | undefined {
  for (const entry of snapshot.entries.values()) {
    if (entry.absolutePath === absolutePath) {
      return entry
    }
  }
}

export function listAssetsByAssetType(
  snapshot: AssetCatalogSnapshot,
  assetType: string,
): AssetCatalogEntry[] {
  return [...snapshot.entries.values()]
    .filter(entry => entry.key.assetType === assetType)
}

export async function buildAssetCatalog(gamePath: AbsPath): Promise<AssetCatalogSnapshot> {
  const gameRootPath = gameRootDir(gamePath)
  const rootEntries = await readDir(gameRootPath)
  const assetDirectories = rootEntries.filter(entry => entry.isDirectory && !!entry.name)
  const assetEntries = await Promise.all(assetDirectories.map(async (entry) => {
    const assetType = entry.name!
    const rootPath = gameAssetDir(gamePath, assetType)
    const files = await collectAssetFiles(rootPath, RelPath.empty())
    return [...files].map(relativePath => createCatalogEntry(assetType, rootPath, relativePath))
  }))

  const entries = assetEntries.flat()
  return {
    entries: new Map(entries.map(entry => [stringifyAssetKey(entry.key), entry])),
  }
}

export function addAssetPathToCatalog(
  snapshot: AssetCatalogSnapshot,
  gamePath: AbsPath,
  absolutePath: AbsPath,
): AssetCatalogSnapshot {
  const entry = resolveCatalogEntry(gamePath, absolutePath)
  if (!entry) {
    return snapshot
  }

  const nextSnapshot = cloneAssetCatalogSnapshot(snapshot)
  nextSnapshot.entries.set(stringifyAssetKey(entry.key), entry)
  return nextSnapshot
}

export function removeAssetPathFromCatalog(
  snapshot: AssetCatalogSnapshot,
  gamePath: AbsPath,
  absolutePath: AbsPath,
): AssetCatalogSnapshot {
  const entry = resolveCatalogEntry(gamePath, absolutePath)
  if (!entry) {
    return snapshot
  }

  if (!snapshot.entries.has(stringifyAssetKey(entry.key))) {
    return snapshot
  }

  const nextSnapshot = cloneAssetCatalogSnapshot(snapshot)
  nextSnapshot.entries.delete(stringifyAssetKey(entry.key))
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
  const gameRootPath = gameRootDir(gamePath)
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
  const gameRootPath = gameRootDir(gamePath)
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

function resolveCatalogEntry(gamePath: AbsPath, absolutePath: AbsPath): AssetCatalogEntry | undefined {
  const resolved = resolveCatalogPath(gamePath, absolutePath)
  if (!resolved) {
    return
  }
  const assetRootPath = gameAssetDir(gamePath, resolved.assetType)
  return createCatalogEntry(resolved.assetType, assetRootPath, resolved.relativePath)
}

function createCatalogEntry(
  assetType: string,
  assetRootPath: AbsPath,
  relativePath: RelPath,
): AssetCatalogEntry {
  const fileName = RelPath.basename(relativePath)
  return {
    key: createAssetKeyForType(assetType, relativePath),
    absolutePath: AbsPath.join(assetRootPath, relativePath),
    fileName,
    extension: readExtension(fileName),
  }
}

function readExtension(fileName: string): string {
  const extensionStart = fileName.lastIndexOf('.')
  return extensionStart === -1 ? '' : fileName.slice(extensionStart)
}
