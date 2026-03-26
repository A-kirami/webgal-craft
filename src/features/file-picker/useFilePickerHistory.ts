import { join } from '@tauri-apps/api/path'
import { exists } from '@tauri-apps/plugin-fs'

import {
  insertFilePickerRecentHistoryPath,
  removeFilePickerRecentHistoryPaths,
  resolveFilePickerHistoryStorageKey,
} from '~/features/file-picker/file-picker'
import { AppError } from '~/types/errors'

interface UseFilePickerHistoryOptions {
  canonicalRootPath: () => string
  ensurePathWithinRoot: (path: string, rootPath: string) => Promise<string>
  historyScopeKey: () => string
}

const FILE_PICKER_HISTORY_STORAGE_KEY = 'webgalcraft:file-picker-history'

export function useFilePickerHistory(options: UseFilePickerHistoryOptions) {
  let historyStore = $(useStorage<Record<string, string[]>>(FILE_PICKER_HISTORY_STORAGE_KEY, {}))
  let recentHistory = $ref<string[]>([])
  let recentHistoryInvalidMap = $ref<Record<string, boolean>>({})

  const historyStorageKey = $computed(() =>
    resolveFilePickerHistoryStorageKey(options.canonicalRootPath(), options.historyScopeKey()),
  )

  function syncRecentHistory() {
    recentHistory = historyStorageKey ? historyStore?.[historyStorageKey] ?? [] : []
    void refreshRecentHistoryInvalidState()
  }

  function setRecentHistoryList(next: string[]) {
    if (!historyStorageKey) {
      return
    }

    historyStore = { ...historyStore, [historyStorageKey]: next }
    recentHistory = next
  }

  function updateRecentHistory(relativePath: string) {
    if (!historyStorageKey) {
      return
    }

    setRecentHistoryList(insertFilePickerRecentHistoryPath(recentHistory, relativePath))
  }

  function removeRecentHistoryPaths(paths: string[]) {
    if (!historyStorageKey || paths.length === 0) {
      return
    }

    const next = removeFilePickerRecentHistoryPaths(recentHistory, paths)
    if (next.length === recentHistory.length) {
      return
    }

    setRecentHistoryList(next)
  }

  function clearRecentHistory() {
    if (!historyStorageKey) {
      return
    }

    setRecentHistoryList([])
    recentHistoryInvalidMap = {}
  }

  function isRecentHistoryInvalid(path: string): boolean {
    return recentHistoryInvalidMap[path] === true
  }

  async function refreshRecentHistoryInvalidState() {
    const canonicalRootPath = options.canonicalRootPath()
    if (!canonicalRootPath || recentHistory.length === 0) {
      recentHistoryInvalidMap = {}
      return
    }

    const snapshot = [...recentHistory]
    const results = await Promise.all(
      snapshot.map(async (path) => {
        try {
          const safePath = await options.ensurePathWithinRoot(
            await join(canonicalRootPath, path),
            canonicalRootPath,
          )

          return {
            path,
            invalid: !(await exists(safePath)),
            remove: false,
          } as const
        } catch (error) {
          return {
            path,
            invalid: true,
            remove: error instanceof AppError && error.code === 'PATH_TRAVERSAL',
          } as const
        }
      }),
    )

    const currentPaths = new Set(recentHistory)
    const removedPaths = results
      .filter(result => result.remove && currentPaths.has(result.path))
      .map(result => result.path)
    if (removedPaths.length > 0) {
      removeRecentHistoryPaths(removedPaths)
    }

    recentHistoryInvalidMap = Object.fromEntries(
      results
        .filter(result => !result.remove && currentPaths.has(result.path))
        .map(result => [result.path, result.invalid] as const),
    )
  }

  return $$({
    clearRecentHistory,
    historyStorageKey,
    isRecentHistoryInvalid,
    recentHistory,
    recentHistoryInvalidMap,
    refreshRecentHistoryInvalidState,
    removeRecentHistoryPaths,
    syncRecentHistory,
    updateRecentHistory,
  })
}
