import { join, normalize } from '@tauri-apps/api/path'
import { exists, readDir, stat } from '@tauri-apps/plugin-fs'
import { LRUCache } from 'lru-cache'
import mime from 'mime/lite'

const MAX_DIRECTORY_CACHE_ITEMS = 256
const DEFAULT_DIRECTORY_CACHE_TTL_MS = 5000

interface DirectoryCacheEntry {
  items: FileViewerItem[]
  expiresAt: number
}

interface ReadDirectoryItemsOptions {
  includeStats?: boolean
  useCache?: boolean
  cacheTtlMs?: number
}

interface InvalidateDirectoryCacheOptions {
  includeChildren?: boolean
}

const directoryCache = new LRUCache<string, DirectoryCacheEntry>({
  max: MAX_DIRECTORY_CACHE_ITEMS,
  updateAgeOnGet: true,
  updateAgeOnHas: true,
})

const inFlightReadMap = new Map<string, Promise<FileViewerItem[]>>()

function toComparablePath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .replace(/\/+$/, '')
    .toLocaleLowerCase()
}

function createCacheKey(path: string, includeStats: boolean): string {
  return `${toComparablePath(path)}::stats:${includeStats ? 1 : 0}`
}

function cloneDirectoryItems(items: FileViewerItem[]): FileViewerItem[] {
  return items.map(item => ({ ...item }))
}

function createCachePrefix(path: string): string {
  return `${toComparablePath(path)}/`
}

function isCacheKeyMatchPath(cacheKey: string, comparablePath: string, includeChildren: boolean): boolean {
  if (cacheKey.startsWith(`${comparablePath}::`)) {
    return true
  }
  if (!includeChildren) {
    return false
  }
  return cacheKey.startsWith(createCachePrefix(comparablePath))
}

function getCachedDirectoryItems(cacheKey: string): FileViewerItem[] | undefined {
  const cacheEntry = directoryCache.get(cacheKey)
  if (!cacheEntry) {
    return undefined
  }
  if (cacheEntry.expiresAt < Date.now()) {
    directoryCache.delete(cacheKey)
    return undefined
  }
  return cloneDirectoryItems(cacheEntry.items)
}

function setCachedDirectoryItems(cacheKey: string, items: FileViewerItem[], ttlMs: number): void {
  directoryCache.set(cacheKey, {
    items: cloneDirectoryItems(items),
    expiresAt: Date.now() + ttlMs,
  })
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
  const cacheKey = createCacheKey(normalizedPath, includeStats)

  if (useCache) {
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
  if (useCache) {
    inFlightReadMap.set(cacheKey, loadTask)
  }

  try {
    const items = await loadTask
    if (useCache && inFlightReadMap.get(cacheKey) === loadTask) {
      setCachedDirectoryItems(cacheKey, items, cacheTtlMs)
    }
    return cloneDirectoryItems(items)
  } finally {
    if (inFlightReadMap.get(cacheKey) === loadTask) {
      inFlightReadMap.delete(cacheKey)
    }
  }
}

export async function invalidateDirectoryItemsCache(
  path: string,
  options: InvalidateDirectoryCacheOptions = {},
): Promise<void> {
  const includeChildren = options.includeChildren ?? false
  const comparablePath = toComparablePath(await normalize(path))

  for (const key of directoryCache.keys()) {
    if (isCacheKeyMatchPath(key, comparablePath, includeChildren)) {
      directoryCache.delete(key)
    }
  }

  for (const key of inFlightReadMap.keys()) {
    if (isCacheKeyMatchPath(key, comparablePath, includeChildren)) {
      inFlightReadMap.delete(key)
    }
  }
}

export function clearDirectoryItemsCache(): void {
  directoryCache.clear()
  inFlightReadMap.clear()
}
