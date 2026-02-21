import { join, normalize } from '@tauri-apps/api/path'
import { exists, readDir, stat } from '@tauri-apps/plugin-fs'
import { LRUCache } from 'lru-cache'
import mime from 'mime/lite'

const MAX_DIRECTORY_CACHE_ITEMS = 256
const DEFAULT_DIRECTORY_CACHE_TTL_MS = 5000

interface ReadDirectoryItemsOptions {
  includeStats?: boolean
  useCache?: boolean
  cacheTtlMs?: number
}

interface InvalidateDirectoryCacheOptions {
  includeChildren?: boolean
}

interface DirectoryCacheKey {
  path: string
  includeStats: boolean
}

interface DirectoryCacheKeyPair {
  withStats: DirectoryCacheKey
  withoutStats: DirectoryCacheKey
}

const cacheKeyRegistry = new Map<string, DirectoryCacheKeyPair>()
const inFlightReadMap = new Map<DirectoryCacheKey, Promise<FileViewerItem[]>>()

const directoryCache = new LRUCache<DirectoryCacheKey, FileViewerItem[]>({
  max: MAX_DIRECTORY_CACHE_ITEMS,
  ttl: DEFAULT_DIRECTORY_CACHE_TTL_MS,
  updateAgeOnGet: true,
  updateAgeOnHas: true,
  dispose: (_items, cacheKey) => {
    cleanupCacheKeyRegistry(cacheKey.path)
  },
})

function getOrCreateCacheKey(path: string, includeStats: boolean): DirectoryCacheKey {
  const comparablePath = toComparablePath(path)
  const existingPair = cacheKeyRegistry.get(comparablePath)
  if (existingPair) {
    return includeStats ? existingPair.withStats : existingPair.withoutStats
  }

  const withStatsKey: DirectoryCacheKey = {
    path: comparablePath,
    includeStats: true,
  }
  const withoutStatsKey: DirectoryCacheKey = {
    path: comparablePath,
    includeStats: false,
  }
  cacheKeyRegistry.set(comparablePath, {
    withStats: withStatsKey,
    withoutStats: withoutStatsKey,
  })
  return includeStats ? withStatsKey : withoutStatsKey
}

function cloneDirectoryItems(items: FileViewerItem[]): FileViewerItem[] {
  return items.map(item => ({ ...item }))
}

function hasCacheEntry(cacheKey: DirectoryCacheKey): boolean {
  return directoryCache.peek(cacheKey) !== undefined
}

function cleanupCacheKeyRegistry(path: string): void {
  const keyPair = cacheKeyRegistry.get(path)
  if (!keyPair) {
    return
  }

  const hasCachedItems = hasCacheEntry(keyPair.withStats) || hasCacheEntry(keyPair.withoutStats)
  const hasInFlightRead = inFlightReadMap.has(keyPair.withStats) || inFlightReadMap.has(keyPair.withoutStats)
  if (!hasCachedItems && !hasInFlightRead) {
    cacheKeyRegistry.delete(path)
  }
}

function isCacheKeyMatchPath(cacheKey: DirectoryCacheKey, comparablePath: string, includeChildren: boolean): boolean {
  if (cacheKey.path === comparablePath) {
    return true
  }
  if (!includeChildren) {
    return false
  }
  return cacheKey.path.startsWith(`${comparablePath}/`)
}

function getCachedDirectoryItems(cacheKey: DirectoryCacheKey): FileViewerItem[] | undefined {
  const cachedItems = directoryCache.get(cacheKey)
  if (!cachedItems) {
    return undefined
  }
  return cloneDirectoryItems(cachedItems)
}

function setCachedDirectoryItems(cacheKey: DirectoryCacheKey, items: FileViewerItem[], ttlMs: number): void {
  directoryCache.set(cacheKey, items, { ttl: ttlMs })
}

async function loadDirectoryItems(absolutePath: string, includeStats: boolean): Promise<FileViewerItem[]> {
  if (!(await exists(absolutePath))) {
    throw new Error('目录不存在')
  }

  const targetStat = await stat(absolutePath)
  if (!targetStat.isDirectory) {
    throw new Error('目标路径不是目录')
  }

  const entries = await readDir(absolutePath)
  const itemResults = await Promise.allSettled(
    entries.map(async (entry) => {
      const entryPath = await join(absolutePath, entry.name)
      const entryIsDir = entry.isDirectory === true
      const entryStat = includeStats ? await stat(entryPath) : undefined

      return {
        name: entry.name,
        path: entryPath,
        isDir: entryIsDir,
        mimeType: entryIsDir ? undefined : mime.getType(entryPath) || '',
        size: entryStat?.size,
        modifiedAt: entryStat?.mtime?.getTime(),
        createdAt: entryStat?.birthtime?.getTime(),
      } satisfies FileViewerItem
    }),
  )

  const items: FileViewerItem[] = []
  let failedCount = 0
  for (const result of itemResults) {
    if (result.status === 'fulfilled') {
      items.push(result.value)
      continue
    }
    failedCount++
    const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason)
    void logger.warn(`[DirectoryCache] 读取目录项失败 (${absolutePath}): ${errorMessage}`)
  }

  if (entries.length > 0 && items.length === 0) {
    throw new Error('目录读取失败：目录项全部读取失败')
  }

  if (failedCount > 0) {
    void logger.warn(`[DirectoryCache] 目录 ${absolutePath} 有 ${failedCount} 个项目读取失败，已跳过`)
  }

  return items
}

export async function readDirectoryItemsCached(
  absolutePath: string,
  options: ReadDirectoryItemsOptions = {},
): Promise<FileViewerItem[]> {
  const includeStats = options.includeStats ?? true
  const useCache = options.useCache ?? true
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_DIRECTORY_CACHE_TTL_MS
  const normalizedPath = await normalize(absolutePath)
  const cacheKey = useCache ? getOrCreateCacheKey(normalizedPath, includeStats) : undefined

  if (useCache && cacheKey) {
    const cachedItems = getCachedDirectoryItems(cacheKey)
    if (cachedItems) {
      return cachedItems
    }

    const inFlight = inFlightReadMap.get(cacheKey)
    if (inFlight) {
      return cloneDirectoryItems(await inFlight)
    }
  }

  const loadTask = loadDirectoryItems(normalizedPath, includeStats)
  if (useCache && cacheKey) {
    inFlightReadMap.set(cacheKey, loadTask)
  }

  try {
    const items = await loadTask
    if (useCache && cacheKey && inFlightReadMap.get(cacheKey) === loadTask) {
      setCachedDirectoryItems(cacheKey, items, cacheTtlMs)
    }
    return items
  } finally {
    if (cacheKey && inFlightReadMap.get(cacheKey) === loadTask) {
      inFlightReadMap.delete(cacheKey)
      cleanupCacheKeyRegistry(cacheKey.path)
    }
  }
}

export async function invalidateDirectoryItemsCache(
  path: string,
  options: InvalidateDirectoryCacheOptions = {},
): Promise<void> {
  const includeChildren = options.includeChildren ?? false
  const comparablePath = toComparablePath(await normalize(path))
  const affectedPaths = new Set<string>()

  for (const key of directoryCache.keys()) {
    if (isCacheKeyMatchPath(key, comparablePath, includeChildren)) {
      directoryCache.delete(key)
      affectedPaths.add(key.path)
    }
  }

  for (const key of inFlightReadMap.keys()) {
    if (isCacheKeyMatchPath(key, comparablePath, includeChildren)) {
      inFlightReadMap.delete(key)
      affectedPaths.add(key.path)
    }
  }

  for (const keyPath of affectedPaths) {
    cleanupCacheKeyRegistry(keyPath)
  }
}

export function clearDirectoryItemsCache(): void {
  directoryCache.clear()
  inFlightReadMap.clear()
  cacheKeyRegistry.clear()
}
