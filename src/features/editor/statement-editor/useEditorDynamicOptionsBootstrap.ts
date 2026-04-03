import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { editorDynamicOptionSources, normalizeGamePath } from '~/features/editor/command-registry/dynamic-options'
import { DynamicOptionsContext, DynamicOptionSourceDef, DynamicOptionsResult, EditorDynamicOptionsKey } from '~/features/editor/command-registry/schema'
import { registerDynamicOptions } from '~/features/editor/dynamic-options/dynamic-options'
import { useWorkspaceStore } from '~/stores/workspace'

interface DynamicOptionItem {
  label: string
  value: string
}

const optionsCache = new Map<EditorDynamicOptionsKey, Map<string, DynamicOptionItem[]>>()
const loadingCache = new Map<EditorDynamicOptionsKey, Map<string, Promise<DynamicOptionItem[]>>>()
// shallowReactive Map：版本号变更时触发 Vue 响应式更新，
// 使依赖 trackSourceVersion 的 computed（如动态选项列表）自动重算。
// 用 shallowReactive 而非 reactive 避免 Map 内部值被深度代理
const sourceVersionMap = shallowReactive(new Map<string, number>())

let hasBootstrapped = false
let hasBoundFileSystemInvalidation = false
let fileSystemInvalidationConsumerCount = 0
let fileSystemInvalidationScope: ReturnType<typeof effectScope> | undefined

function createSourceToken(key: EditorDynamicOptionsKey, cacheKey: string): string {
  return `${key}::${cacheKey}`
}

function normalizeOptionValue(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return
  }
  return trimmed
}

function normalizeOptionItems(items: DynamicOptionItem[]): DynamicOptionItem[] {
  const deduped = new Map<string, DynamicOptionItem>()
  for (const item of items) {
    const value = normalizeOptionValue(item.value)
    if (!value) {
      continue
    }
    const label = normalizeOptionValue(item.label) ?? value
    if (!deduped.has(value)) {
      deduped.set(value, { label, value })
    }
  }

  return [...deduped.values()].toSorted((a, b) => a.label.localeCompare(b.label))
}

function getOrCreateCacheMap<T>(
  cache: Map<EditorDynamicOptionsKey, Map<string, T>>,
  key: EditorDynamicOptionsKey,
): Map<string, T> {
  const existing = cache.get(key)
  if (existing) {
    return existing
  }
  const created = new Map<string, T>()
  cache.set(key, created)
  return created
}

function touchSourceVersion(key: EditorDynamicOptionsKey, cacheKey: string) {
  const token = createSourceToken(key, cacheKey)
  sourceVersionMap.set(token, (sourceVersionMap.get(token) ?? 0) + 1)
}

// 在 resolver 内调用以建立 Vue 响应式依赖：
// 当 touchSourceVersion 修改版本号时，所有读取过该 token 的 computed 会重新求值，
// 从而触发 UI 刷新加载完成的选项列表
function trackSourceVersion(key: EditorDynamicOptionsKey, cacheKey: string): number {
  const token = createSourceToken(key, cacheKey)
  return sourceVersionMap.get(token) ?? 0
}

function invalidateSourceCache(source: DynamicOptionSourceDef, cacheKey: string) {
  const sourceOptionsCache = getOrCreateCacheMap(optionsCache, source.key)
  const sourceLoadingCache = getOrCreateCacheMap(loadingCache, source.key)

  for (const cache of [sourceOptionsCache, sourceLoadingCache]) {
    if (cache.has(cacheKey)) {
      cache.delete(cacheKey)
      touchSourceVersion(source.key, cacheKey)
    }
  }
}

function createSourceResolver(source: DynamicOptionSourceDef): (ctx: DynamicOptionsContext) => DynamicOptionsResult {
  return (ctx: DynamicOptionsContext): DynamicOptionsResult => {
    const cacheKey = source.resolveCacheKey(ctx)
    if (!cacheKey) {
      return {
        options: [],
        loading: false,
      }
    }

    trackSourceVersion(source.key, cacheKey)

    const sourceOptionsCache = getOrCreateCacheMap(optionsCache, source.key)
    const sourceLoadingCache = getOrCreateCacheMap(loadingCache, source.key)

    const cached = sourceOptionsCache.get(cacheKey)
    if (cached) {
      return {
        options: cached,
        loading: false,
      }
    }

    if (!sourceLoadingCache.has(cacheKey)) {
      const loadingTask = source.loadOptions(ctx)
        .then(items => normalizeOptionItems(items))
        .catch((error) => {
          logger.error(`加载动态选项失败(${source.key}): ${error}`)
          return []
        })
        .then((normalized) => {
          sourceOptionsCache.set(cacheKey, normalized)
          return normalized
        })
        .finally(() => {
          sourceLoadingCache.delete(cacheKey)
          touchSourceVersion(source.key, cacheKey)
        })
      sourceLoadingCache.set(cacheKey, loadingTask)
    }

    return {
      options: [],
      loading: true,
    }
  }
}

function bindFileSystemInvalidation() {
  fileSystemInvalidationConsumerCount += 1

  if (hasBoundFileSystemInvalidation) {
    return
  }
  hasBoundFileSystemInvalidation = true

  fileSystemInvalidationScope = effectScope()
  fileSystemInvalidationScope.run(() => {
    const fileSystemEvents = useFileSystemEvents()
    const workspaceStore = useWorkspaceStore()

    function handlePathChange(path: string) {
      const gamePath = workspaceStore.CWD
      if (!gamePath) {
        return
      }
      const cacheKey = normalizeGamePath(gamePath)
      for (const source of editorDynamicOptionSources) {
        if (!source.invalidateByFileModified?.(path)) {
          continue
        }
        invalidateSourceCache(source, cacheKey)
      }
    }

    const singlePathEvents = [
      'file:created', 'file:modified', 'file:removed',
      'directory:created', 'directory:removed',
    ] as const

    for (const event of singlePathEvents) {
      fileSystemEvents.on(event, e => handlePathChange(e.path))
    }

    const renamedEvents = ['file:renamed', 'directory:renamed'] as const

    for (const event of renamedEvents) {
      fileSystemEvents.on(event, (e) => {
        handlePathChange(e.oldPath)
        handlePathChange(e.newPath)
      })
    }
  })
}

function releaseFileSystemInvalidation() {
  fileSystemInvalidationConsumerCount = Math.max(0, fileSystemInvalidationConsumerCount - 1)
  if (fileSystemInvalidationConsumerCount > 0) {
    return
  }

  fileSystemInvalidationScope?.stop()
  fileSystemInvalidationScope = undefined
  hasBoundFileSystemInvalidation = false
}

/**
 * 动态选项解析器为全局注册，文件系统失效监听则跟随当前活跃编辑器作用域数量绑定。
 * 仅需在编辑器入口（如 useStatementEditor）调用，重复调用会复用同一套解析器与监听。
 */
export function useEditorDynamicOptionsBootstrap() {
  if (!hasBootstrapped) {
    hasBootstrapped = true

    for (const source of editorDynamicOptionSources) {
      registerDynamicOptions(source.key, createSourceResolver(source))
    }
  }

  bindFileSystemInvalidation()

  onScopeDispose(() => {
    releaseFileSystemInvalidation()
  })
}
