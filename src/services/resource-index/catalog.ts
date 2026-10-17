import { gameAssetsCmds } from '~/commands/game-assets'
import { AbsPath, RelPath } from '~/domain/path'
import { gameAssetDir, gameRootDir } from '~/services/platform/app-paths'

import { createAssetKeyForType, stringifyAssetKey } from './keys'

import type { AssetKey } from './keys'

const ANIMATION_TABLE_FILE_NAME = 'animationTable.json'

export interface AssetCatalogEntry {
  key: AssetKey
  absolutePath: AbsPath
  fileName: string
  extension: string
}

export interface AssetCatalogSnapshot {
  // 用于把绝对路径还原成 key，避免为 80k 条目再维护一份路径索引。
  gamePath?: AbsPath
  entries: Map<string, AssetCatalogEntry>
}

export function createEmptyAssetCatalogSnapshot(): AssetCatalogSnapshot {
  return {
    gamePath: undefined,
    entries: new Map<string, AssetCatalogEntry>(),
  }
}

function cloneAssetCatalogSnapshot(snapshot: AssetCatalogSnapshot): AssetCatalogSnapshot {
  return {
    gamePath: snapshot.gamePath,
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
  if (!snapshot.gamePath) {
    return
  }

  const resolved = resolveCatalogPath(snapshot.gamePath, absolutePath)
  if (!resolved) {
    return
  }

  return getAssetFromCatalog(
    snapshot,
    createAssetKeyForType(resolved.assetType, resolved.relativePath),
  )
}

export function listAssetsByAssetType(
  snapshot: AssetCatalogSnapshot,
  assetType: string,
): AssetCatalogEntry[] {
  return [...snapshot.entries.values()]
    .filter(entry => entry.key.assetType === assetType)
}

export async function buildAssetCatalog(gamePath: AbsPath): Promise<AssetCatalogSnapshot> {
  const startedAt = Date.now()
  const files = await gameAssetsCmds.scan(gamePath)
  const assetRootPaths = new Map<string, AbsPath>()
  const entries = new Map<string, AssetCatalogEntry>()

  for (const file of files) {
    if (!shouldCatalogAsset(file.assetType, file.relativePath)) {
      continue
    }

    let assetRootPath = assetRootPaths.get(file.assetType)
    if (!assetRootPath) {
      assetRootPath = gameAssetDir(gamePath, file.assetType)
      assetRootPaths.set(file.assetType, assetRootPath)
    }

    const entry = createCatalogEntry(file.assetType, assetRootPath, file.relativePath)
    entries.set(stringifyAssetKey(entry.key), entry)
  }

  logger.debug(
    `资源清单扫描完成: ${files.length} 个文件, ${entries.size} 个资源, `
    + `耗时 ${Date.now() - startedAt}ms`,
  )
  return {
    gamePath,
    entries,
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

  const key = stringifyAssetKey(entry.key)
  if (!snapshot.entries.has(key)) {
    return snapshot
  }

  const nextSnapshot = cloneAssetCatalogSnapshot(snapshot)
  nextSnapshot.entries.delete(key)
  return nextSnapshot
}

export function renameAssetPathInCatalog(
  snapshot: AssetCatalogSnapshot,
  gamePath: AbsPath,
  oldPath: AbsPath,
  newPath: AbsPath,
): AssetCatalogSnapshot {
  const sourceEntry = resolveCatalogEntry(gamePath, oldPath)
  const targetEntry = resolveCatalogEntry(gamePath, newPath)
  if (!sourceEntry && !targetEntry) {
    return snapshot
  }

  const nextSnapshot = cloneAssetCatalogSnapshot(snapshot)
  if (sourceEntry) {
    nextSnapshot.entries.delete(stringifyAssetKey(sourceEntry.key))
  }
  if (targetEntry) {
    nextSnapshot.entries.set(stringifyAssetKey(targetEntry.key), targetEntry)
  }
  return nextSnapshot
}

export function isPathWithinGameRoot(gamePath: AbsPath, path: AbsPath): boolean {
  const gameRootPath = gameRootDir(gamePath)
  return path === gameRootPath || path.startsWith(`${gameRootPath}/`)
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
  if (!resolved || !shouldCatalogAsset(resolved.assetType, resolved.relativePath)) {
    return
  }
  const assetRootPath = gameAssetDir(gamePath, resolved.assetType)
  return createCatalogEntry(resolved.assetType, assetRootPath, resolved.relativePath)
}

function shouldCatalogAsset(assetType: string, relativePath: RelPath): boolean {
  return assetType !== 'animation'
    || relativePath.toLowerCase() !== ANIMATION_TABLE_FILE_NAME.toLowerCase()
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
