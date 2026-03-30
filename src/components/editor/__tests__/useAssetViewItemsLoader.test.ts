import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { useAssetViewItemsLoader } from '../useAssetViewItemsLoader'

import type { EffectScope } from 'vue'
import type { FileItem, FileSystemItem } from '~/stores/file'
import type { FileViewerItem } from '~/types/file-viewer'

function createFileItem(input: Partial<FileItem> & Pick<FileItem, 'name' | 'path'>): FileItem {
  return {
    createdAt: 1,
    id: input.path,
    isDir: false,
    mimeType: 'image/png',
    modifiedAt: 2,
    parentId: undefined,
    size: 1024,
    ...input,
  }
}

function toFileViewerItem(item: FileSystemItem): FileViewerItem {
  return {
    createdAt: item.createdAt,
    isDir: item.isDir,
    mimeType: item.isDir ? undefined : item.mimeType,
    modifiedAt: item.modifiedAt,
    name: item.name,
    path: item.path,
    size: item.size,
  }
}

async function flushLoaderWatchers() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

describe('useAssetViewItemsLoader 行为', () => {
  let scope: EffectScope | undefined

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    scope?.stop()
    scope = undefined
    vi.useRealTimers()
  })

  it('会在目录就绪后自动加载并映射条目', async () => {
    let resolveLoad: ((items: FileSystemItem[]) => void) | undefined
    const firstLoad = new Promise<FileSystemItem[]>((resolve) => {
      resolveLoad = resolve
    })
    const loadDirectory = vi.fn().mockReturnValue(firstLoad)

    const assetBasePath = ref('/games/demo/assets/bg')
    const currentDirectoryPath = ref('/games/demo/assets/bg')
    const currentPath = ref('')

    scope = effectScope()
    const loader = scope.run(() => useAssetViewItemsLoader({
      assetBasePath,
      currentDirectoryPath,
      currentPath,
      loadDirectory,
      mapItem: toFileViewerItem,
    }))

    expect(loader).toBeDefined()

    await flushLoaderWatchers()

    expect(loadDirectory).toHaveBeenCalledWith('/games/demo/assets/bg')
    expect(loader?.isLoading.value).toBe(true)

    resolveLoad?.([
      createFileItem({
        name: 'opening.png',
        path: '/games/demo/assets/bg/opening.png',
      }),
    ])
    await flushLoaderWatchers()

    expect(loader?.items.value).toEqual([
      toFileViewerItem(createFileItem({
        name: 'opening.png',
        path: '/games/demo/assets/bg/opening.png',
      })),
    ])
    expect(loader?.isLoading.value).toBe(false)
    expect(loader?.errorMsg.value).toBe('')
  })

  it('静默刷新与目录切换同批触发时会保留显式 loading 和最新目录', async () => {
    const loadDirectory = vi.fn()
      .mockResolvedValueOnce([])
      .mockImplementationOnce(() => new Promise<FileSystemItem[]>(() => undefined))

    const assetBasePath = ref('/games/demo/assets/bg')
    const currentDirectoryPath = ref('/games/demo/assets/bg')
    const currentPath = ref('')

    scope = effectScope()
    const loader = scope.run(() => useAssetViewItemsLoader({
      assetBasePath,
      currentDirectoryPath,
      currentPath,
      loadDirectory,
      mapItem: toFileViewerItem,
    }))

    expect(loader).toBeDefined()

    await flushLoaderWatchers()
    await flushLoaderWatchers()

    expect(loadDirectory).toHaveBeenCalledTimes(1)

    loader?.scheduleItemsRefresh(true)
    currentPath.value = 'chapter-1'
    currentDirectoryPath.value = '/games/demo/assets/bg/chapter-1'

    await flushLoaderWatchers()

    expect(loadDirectory).toHaveBeenCalledTimes(2)
    expect(loadDirectory).toHaveBeenLastCalledWith('/games/demo/assets/bg/chapter-1')
    expect(loader?.isLoading.value).toBe(true)
  })
})
