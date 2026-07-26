import { nextTick, ref, toValue, watch } from 'vue'

import { mergeQueuedAssetViewLoad } from '~/components/editor/asset-view-load'
import { AppError } from '~/types/errors'

import type { MaybeRefOrGetter } from 'vue'
import type { FileViewerItem } from '~/types/file-viewer'

interface UseAssetViewItemsLoaderOptions<TItem> {
  currentDirectoryPath: MaybeRefOrGetter<string>
  currentPath: MaybeRefOrGetter<string>
  rootDirectoryExists: (directoryPath: string) => Promise<boolean>
  loadDirectory: (directoryPath: string) => Promise<TItem[]>
  mapItem: (item: TItem) => FileViewerItem
}

export function useAssetViewItemsLoader<TItem>(options: UseAssetViewItemsLoaderOptions<TItem>) {
  const items = ref<FileViewerItem[]>([])
  const isLoading = ref(false)
  const errorMsg = ref('')
  const isRootDirectoryMissing = ref(false)
  const itemsRefreshKey = ref(0)
  const nextItemsRefreshIsSilent = ref(false)
  const pendingItemsLoad = ref<{ directoryPath: string, isSilent: boolean }>()

  let latestLoadToken = 0
  let isItemsLoadFlushScheduled = false

  function scheduleItemsRefresh(isSilent: boolean): void {
    nextItemsRefreshIsSilent.value = isSilent
    itemsRefreshKey.value++
  }

  function flushQueuedItemsLoad(): void {
    isItemsLoadFlushScheduled = false

    const request = pendingItemsLoad.value
    pendingItemsLoad.value = undefined
    if (!request) {
      return
    }

    void loadItems(request.directoryPath, request.isSilent)
  }

  function queueItemsLoad(directoryPath: string, isSilent: boolean): void {
    pendingItemsLoad.value = mergeQueuedAssetViewLoad(pendingItemsLoad.value, {
      directoryPath,
      isSilent,
    })

    if (isItemsLoadFlushScheduled) {
      return
    }

    isItemsLoadFlushScheduled = true
    queueMicrotask(flushQueuedItemsLoad)
  }

  watch(
    () => toValue(options.currentDirectoryPath),
    (directoryPath) => {
      queueItemsLoad(directoryPath, false)
    },
    { immediate: true },
  )

  watch(itemsRefreshKey, () => {
    const isSilentRefresh = nextItemsRefreshIsSilent.value
    nextItemsRefreshIsSilent.value = false

    queueItemsLoad(toValue(options.currentDirectoryPath), isSilentRefresh)
  })

  async function loadItems(directoryPath: string, isSilentRefresh: boolean): Promise<void> {
    const loadToken = ++latestLoadToken
    const relativePath = toValue(options.currentPath)

    if (!isSilentRefresh) {
      isLoading.value = true
    }
    errorMsg.value = ''

    // 确保重任务开始前先把 loading 状态提交到视图。
    if (!isSilentRefresh) {
      await nextTick()
    }

    try {
      if (!directoryPath) {
        if (loadToken === latestLoadToken) {
          items.value = []
          isRootDirectoryMissing.value = false
        }
        return
      }

      const [result, rootDirectoryExists] = await Promise.all([
        options.loadDirectory(directoryPath),
        relativePath ? true : options.rootDirectoryExists(directoryPath),
      ])
      if (loadToken === latestLoadToken) {
        items.value = result.map(item => options.mapItem(item))
        isRootDirectoryMissing.value = !rootDirectoryExists
      }
    } catch (error) {
      if (loadToken !== latestLoadToken) {
        return
      }

      if (!relativePath && error instanceof AppError && error.code === 'DIR_NOT_FOUND') {
        items.value = []
        isRootDirectoryMissing.value = true
        return
      }

      errorMsg.value = error instanceof Error ? error.message : String(error)
      items.value = []
      isRootDirectoryMissing.value = false
    } finally {
      if (loadToken === latestLoadToken) {
        isLoading.value = false
      }
    }
  }

  return {
    items,
    isLoading,
    errorMsg,
    isRootDirectoryMissing,
    scheduleItemsRefresh,
  }
}
