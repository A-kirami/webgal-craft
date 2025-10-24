import { basename, join } from '@tauri-apps/api/path'
import { exists, readDir, stat, watch as watchFs } from '@tauri-apps/plugin-fs'
import { LRUCache } from 'lru-cache'
import mime from 'mime/lite'
import naturalCompare from 'natural-compare-lite'
import { defineStore } from 'pinia'

import type { WatchEvent } from '@tauri-apps/plugin-fs'

/**
 * 最大缓存项数
 */
const MAX_CACHE_ITEMS = 5000

/**
 * 文件系统项的基础接口
 */
interface FileSystemItemBase {
  id: string
  name: string
  path: string
  parentId: string | undefined
}

/**
 * 文件项接口
 */
export interface FileItem extends FileSystemItemBase {
  isDir: false
  mimeType: string
}

/**
 * 目录项接口
 */
export interface DirItem extends FileSystemItemBase {
  isDir: true
  childIds: string[]
  isLoaded: boolean
}

export type FileSystemItem = FileItem | DirItem

/**
 * 文件系统错误
 */
class FileSystemError extends Error {
  constructor(message: string, public path: string) {
    super(message)
    this.name = 'FileSystemError'
  }
}

/**
 * 文件系统状态管理
 */
export const useFileStore = defineStore('file', () => {
  const items = $ref<LRUCache<string, FileSystemItem>>(new LRUCache({
    max: MAX_CACHE_ITEMS,
    updateAgeOnGet: true,
    updateAgeOnHas: true,
  }))

  const pathToId = $ref<LRUCache<string, string>>(new LRUCache({
    max: MAX_CACHE_ITEMS,
    updateAgeOnGet: true,
    updateAgeOnHas: true,
  }))

  /**
   * 获取或创建项目ID
   */
  function getOrCreateItemId(path: string): string {
    const existingId = pathToId.get(path)
    if (existingId) {
      return existingId
    }
    const newId = crypto.randomUUID()
    pathToId.set(path, newId)
    return newId
  }

  /**
   * 批量更新路径映射
   */
  function updatePathMappings(oldPath: string, newPath: string, id: string) {
    pathToId.delete(oldPath)
    pathToId.set(newPath, id)
  }

  /**
   * 更新子树路径
   */
  async function updateSubtreePaths(item: DirItem, newBasePath: string) {
    const newPath = await join(newBasePath, item.name)

    // 批量处理子项
    const childUpdates = item.childIds.map(async (childId) => {
      const child = items.get(childId)
      if (!child) {
        return
      }

      if (child.isDir) {
        await updateSubtreePaths(child, newPath)
      } else {
        const oldPath = child.path
        child.path = await join(newPath, child.name)
        updatePathMappings(oldPath, child.path, child.id)
      }
    })

    await Promise.all(childUpdates)

    // 更新自身
    const oldPath = item.path
    item.path = newPath
    updatePathMappings(oldPath, newPath, item.id)
  }

  /**
   * 加载目录内容
   */
  async function loadDirectory(path: string, parentId?: string) {
    const parent = parentId ? items.get(parentId) : undefined
    if (!parent?.isDir || parent.isLoaded) {
      return
    }

    try {
      parent.isLoaded = true
      const entries = await readDir(path)

      // 批量处理子项
      const newItems = await Promise.all(entries.map(async (entry) => {
        const itemPath = await join(path, entry.name)
        const name = await basename(itemPath)
        const id = getOrCreateItemId(itemPath)

        if (entry.isDirectory) {
          const dir: DirItem = {
            id,
            name,
            path: itemPath,
            parentId,
            isDir: true,
            childIds: [],
            isLoaded: false,
          }
          items.set(id, dir)
          return dir
        } else {
          const file: FileItem = {
            id,
            name,
            path: itemPath,
            parentId,
            isDir: false,
            mimeType: mime.getType(itemPath) || '',
          }
          items.set(id, file)
          return file
        }
      }))

      // 预排序并更新子项列表
      parent.childIds = newItems
        .toSorted((a, b) => {
          if (a.isDir !== b.isDir) {
            return a.isDir ? -1 : 1
          }
          return naturalCompare(a.name, b.name)
        })
        .map(item => item.id)
    } catch (error) {
      parent.isLoaded = false
      void logger.error(`加载目录 ${path} 失败: ${error}`)
      throw new FileSystemError(
        `加载目录失败: ${error instanceof Error ? error.message : String(error)}`,
        path,
      )
    }
  }

  /**
   * 获取目录内容
   */
  async function getFolderContents(path: string): Promise<FileSystemItem[]> {
    if (!(await exists(path))) {
      throw new FileSystemError('目录不存在', path)
    }

    let parentId = pathToId.get(path)
    if (!parentId) {
      parentId = getOrCreateItemId(path)
      const parentDir: DirItem = {
        id: parentId,
        name: await basename(path),
        path,
        parentId: undefined,
        isDir: true,
        childIds: [],
        isLoaded: false,
      }
      items.set(parentId, parentDir)
      pathToId.set(path, parentId)
    }

    const parent = items.get(parentId)
    if (!parent?.isDir) {
      throw new FileSystemError('路径不是目录', path)
    }

    if (!parent.isLoaded) {
      await loadDirectory(path, parentId)
    }

    // 清理无效的子项引用
    parent.childIds = parent.childIds.filter(id => items.has(id))

    return parent.childIds
      .map(id => items.get(id))
      .filter((item): item is FileSystemItem => !!item)
  }

  /**
   * 更新项目路径
   */
  async function updateItemPath(id: string, newPath: string) {
    const item = items.get(id)
    if (!item) {
      throw new FileSystemError('项目不存在', newPath)
    }

    if (item.isDir) {
      await updateSubtreePaths(item, newPath)
    } else {
      const oldPath = item.path
      item.path = newPath
      updatePathMappings(oldPath, newPath, id)
    }
  }

  /**
   * 清除所有状态
   */
  function clear() {
    items.clear()
    pathToId.clear()
    if (unwatch) {
      unwatch()
      unwatch = undefined
    }
  }

  let unwatch: (() => void) | undefined

  const workspaceStore = useWorkspaceStore()

  /**
   * 初始化文件系统
   */
  async function initialize() {
    if (workspaceStore.CWD) {
      try {
        const rootPath = await join(workspaceStore.CWD, 'game')
        await getFolderContents(rootPath)
        unwatch = await watchFs(rootPath, handleWatchEvent, { recursive: true, delayMs: 1000 })
      } catch (error) {
        void logger.error(`初始化文件系统失败: ${error}`)
      }
    }
  }

  // 监听工作区变化
  watch(() => workspaceStore.CWD, async (newPath) => {
    clear()
    if (newPath) {
      await initialize()
    }
  })

  /**
   * 处理文件创建事件
   */
  async function handleCreateEvent(path: string, parentId: string | undefined) {
    const name = await basename(path)
    const id = getOrCreateItemId(path)
    const fileInfo = await stat(path)

    const item: FileSystemItem = fileInfo.isDirectory
      ? {
          id,
          name,
          path,
          parentId,
          isDir: true,
          childIds: [],
          isLoaded: false,
        }
      : {
          id,
          name,
          path,
          parentId,
          isDir: false,
          mimeType: mime.getType(path) || '',
        }

    items.set(id, item)

    if (parentId) {
      const parent = items.get(parentId)
      if (parent?.isDir) {
        parent.childIds.push(id)
        // 延迟排序，避免频繁排序
        if (parent.childIds.length > 10) {
          parent.childIds.sort((a, b) => {
            const itemA = items.get(a)
            const itemB = items.get(b)
            if (!itemA || !itemB) {
              return 0
            }
            if (itemA.isDir !== itemB.isDir) {
              return itemA.isDir ? -1 : 1
            }
            return naturalCompare(itemA.name, itemB.name)
          })
        }
      }
    }
  }

  /**
   * 处理文件删除事件
   */
  function handleRemoveEvent(path: string) {
    const id = pathToId.get(path)
    if (!id) {
      return
    }

    const item = items.get(id)
    if (item?.parentId) {
      const parent = items.get(item.parentId)
      if (parent?.isDir) {
        parent.childIds = parent.childIds.filter(childId => childId !== id)
      }
    }
    items.delete(id)
    pathToId.delete(path)
  }

  /**
   * 处理文件重命名事件
   */
  async function handleRenameEvent(newPath: string, oldPath: string) {
    const id = pathToId.get(oldPath)
    if (!id) {
      return
    }

    const item = items.get(id)
    if (!item) {
      return
    }

    const originalPath = item.path
    item.path = newPath
    item.name = await basename(newPath)
    updatePathMappings(originalPath, newPath, id)
  }

  /**
   * 处理文件系统变更事件
   */
  async function handleWatchEvent(event: WatchEvent) {
    const { type, paths } = event
    const path = paths[0]
    if (!path) {
      return
    }

    // 过滤掉 'any' 类型的修改事件
    if (typeof type === 'object' && type !== null && 'modify' in type && type.modify.kind === 'any') {
      return
    }

    try {
      const parentPath = await join(path, '..')
      const parentId = pathToId.get(parentPath)

      if (typeof type === 'object' && type !== null) {
        if ('create' in type) {
          await handleCreateEvent(path, parentId)
        } else if ('remove' in type) {
          handleRemoveEvent(path)
        } else if ('modify' in type) {
          if (type.modify.kind === 'rename') {
            const oldPath = paths[1]
            if (!oldPath) {
              return
            }
            await handleRenameEvent(path, oldPath)
          } else {
            // 对于其他修改事件，只更新文件信息
            const id = pathToId.get(path)
            if (id) {
              const item = items.get(id)
              if (item && !item.isDir) {
                item.name = await basename(path)
              }
            }
          }
        }
      }
    } catch (error) {
      void logger.error(`处理文件系统事件失败: ${error}`)
      // 向上层抛出错误，允许调用者处理
      throw new FileSystemError(
        `处理文件系统事件失败: ${error instanceof Error ? error.message : String(error)}`,
        path,
      )
    }
  }

  return $$({
    getFolderContents,
    updateItemPath,
    clear,
    initialize,
  })
})
