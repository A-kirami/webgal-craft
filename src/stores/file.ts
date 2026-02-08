import { basename, join } from '@tauri-apps/api/path'
import { exists, readDir, stat, watch as watchFs } from '@tauri-apps/plugin-fs'
import { LRUCache } from 'lru-cache'
import mime from 'mime/lite'
import naturalCompare from 'natural-compare-lite'
import { defineStore } from 'pinia'

import type { WatchEvent } from '@tauri-apps/plugin-fs'

import { isDebug } from '~build/meta'

/**
 * 最大缓存项数
 */
const MAX_CACHE_ITEMS = 5000

/**
 * 文件系统监听延迟（毫秒）
 */
const WATCH_DELAY_MS = 150

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
  // ==================== 状态定义 ====================

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

  const fileSystemEvents = useFileSystemEvents()
  const workspaceStore = useWorkspaceStore()
  let unwatch: (() => void) | undefined

  // ==================== 路径管理辅助函数 ====================

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
   * 递归更新目录及其所有子项的路径
   * 当目录被重命名或移动时，需要更新整个子树的所有路径映射
   */
  async function updateSubtreePaths(item: DirItem, newBasePath: string): Promise<void> {
    const newPath = await join(newBasePath, item.name)

    const childUpdates = item.childIds
      .map(id => items.get(id))
      .filter((child): child is FileSystemItem => !!child)
      .map(async (child) => {
        if (child.isDir) {
          await updateSubtreePaths(child, newPath)
        } else {
          const oldPath = child.path
          child.path = await join(newPath, child.name)
          updatePathMappings(oldPath, child.path, child.id)
        }
      })

    await Promise.all(childUpdates)

    const oldPath = item.path
    item.path = newPath
    updatePathMappings(oldPath, newPath, item.id)
  }

  // ==================== 文件系统项操作辅助函数 ====================

  /**
   * 创建文件系统项
   */
  async function createFileSystemItem(
    path: string,
    parentId: string | undefined,
  ): Promise<FileSystemItem> {
    const name = await basename(path)
    const id = getOrCreateItemId(path)
    const fileInfo = await stat(path)

    if (fileInfo.isDirectory) {
      return {
        id,
        name,
        path,
        parentId,
        isDir: true,
        childIds: [],
        isLoaded: false,
      }
    }

    return {
      id,
      name,
      path,
      parentId,
      isDir: false,
      mimeType: mime.getType(path) || '',
    }
  }

  // ==================== 父子关系管理辅助函数 ====================

  /**
   * 比较两个文件系统项
   * 目录优先，然后按自然顺序排序
   */
  function compareFileSystemItems(a: FileSystemItem, b: FileSystemItem): number {
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1
    }
    return naturalCompare(a.name, b.name)
  }

  /**
   * 将子项添加到父目录
   * 添加后立即排序整个列表，确保数据始终有序
   */
  function addChildToParent(childId: string, parentId: string | undefined): void {
    if (!parentId) {
      return
    }

    const parent = items.get(parentId)
    if (!parent?.isDir) {
      return
    }

    parent.childIds.push(childId)
    parent.childIds.sort((a, b) => {
      const itemA = items.get(a)
      const itemB = items.get(b)
      if (!itemA || !itemB) {
        return 0
      }
      return compareFileSystemItems(itemA, itemB)
    })
  }

  /**
   * 从父目录移除子项
   */
  function removeChildFromParent(childId: string, parentId: string | undefined): void {
    if (!parentId) {
      return
    }

    const parent = items.get(parentId)
    if (parent?.isDir) {
      parent.childIds = parent.childIds.filter(id => id !== childId)
    }
  }

  // ==================== 核心业务函数 ====================

  /**
   * 加载目录内容
   * 读取目录下的所有文件和子目录，并创建对应的文件系统项
   */
  async function loadDirectory(path: string, parentId?: string): Promise<void> {
    const parent = parentId ? items.get(parentId) : undefined
    if (!parent?.isDir || parent.isLoaded) {
      return
    }

    try {
      parent.isLoaded = true
      const entries = await readDir(path)

      const newItems = await Promise.all(
        entries.map(async (entry) => {
          const itemPath = await join(path, entry.name)
          return await createFileSystemItem(itemPath, parentId)
        }),
      )

      for (const item of newItems) {
        items.set(item.id, item)
      }

      parent.childIds = newItems
        .toSorted(compareFileSystemItems)
        .map(item => item.id)
    } catch (error) {
      parent.isLoaded = false
      const errorMessage = error instanceof Error ? error.message : String(error)
      void logger.error(`[FileStore] 加载目录 ${path} 失败: ${errorMessage}`)
      throw new FileSystemError(
        `加载目录失败: ${errorMessage}`,
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

  // ==================== 文件系统监听相关 ====================

  /**
   * 检查事件类型是否为指定的类型
   * @param type 事件类型
   * @param key 要检查的事件类型（'create' | 'remove' | 'modify'）
   */
  function isEventType(
    type: WatchEvent['type'],
    key: 'create' | 'remove' | 'modify',
  ): boolean {
    return typeof type === 'object' && type !== null && key in type
  }

  /**
   * 发布文件系统事件
   * 根据项目类型和事件类型构造并发送相应的事件
   */
  function emitFileSystemEvent(
    item: FileSystemItem,
    options:
      | { eventType: 'created', path: string, parentId?: string }
      | { eventType: 'removed', path: string }
      | { eventType: 'renamed', oldPath: string, newPath: string }
      | { eventType: 'modified', path: string },
  ): void {
    const prefix = item.isDir ? 'directory' : 'file'

    if (isDebug) {
      const logMessage = options.eventType === 'renamed'
        ? `[FileSystemEvent] ${prefix}:${options.eventType} - ${options.oldPath} -> ${options.newPath}`
        : `[FileSystemEvent] ${prefix}:${options.eventType} - ${options.path}`
      logger.debug(logMessage)
    }

    switch (options.eventType) {
      case 'created': {
        fileSystemEvents.emit({
          type: `${prefix}:created`,
          path: options.path,
          parentId: options.parentId,
        })
        break
      }
      case 'removed': {
        fileSystemEvents.emit({
          type: `${prefix}:removed`,
          path: options.path,
        })
        break
      }
      case 'renamed': {
        fileSystemEvents.emit({
          type: `${prefix}:renamed`,
          oldPath: options.oldPath,
          newPath: options.newPath,
        })
        break
      }
      case 'modified': {
        fileSystemEvents.emit({
          type: `${prefix}:modified`,
          path: options.path,
        })
        break
      }
      default: {
        break
      }
    }
  }

  /**
   * 处理文件创建事件
   */
  async function handleCreateEvent(path: string, parentId: string | undefined): Promise<void> {
    try {
      const item = await createFileSystemItem(path, parentId)
      items.set(item.id, item)
      addChildToParent(item.id, parentId)
      emitFileSystemEvent(item, { eventType: 'created', path, parentId })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      void logger.error(`[FileStore] 处理 ${path} 创建事件失败: ${errorMessage}`)
      throw new FileSystemError(
        `处理 ${path} 创建事件失败: ${errorMessage}`,
        path,
      )
    }
  }

  /**
   * 通过路径获取文件系统项
   * 如果路径不存在或对应的项不存在，返回 undefined
   */
  function getItemByPath(path: string): FileSystemItem | undefined {
    const id = pathToId.get(path)
    if (!id) {
      return undefined
    }

    const item = items.get(id)
    return item
  }

  /**
   * 处理文件删除事件
   */
  function handleRemoveEvent(path: string): void {
    const item = getItemByPath(path)
    if (!item) {
      return
    }

    removeChildFromParent(item.id, item.parentId)
    items.delete(item.id)
    pathToId.delete(path)

    emitFileSystemEvent(item, { eventType: 'removed', path })
  }

  /**
   * 处理文件重命名事件
   * 对于目录，需要递归更新所有子项的路径
   */
  async function handleRenameEvent(newPath: string, oldPath: string): Promise<void> {
    const item = getItemByPath(oldPath)
    if (!item) {
      return
    }

    try {
      const originalPath = item.path
      item.name = await basename(newPath)

      if (item.isDir) {
        const parentPath = await join(newPath, '..')
        await updateSubtreePaths(item, parentPath)
      } else {
        item.path = newPath
        updatePathMappings(originalPath, newPath, item.id)
      }

      emitFileSystemEvent(item, { eventType: 'renamed', oldPath, newPath })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      void logger.error(`[FileStore] 处理 ${oldPath} -> ${newPath} 重命名事件失败: ${errorMessage}`)
      throw new FileSystemError(
        `处理 ${oldPath} -> ${newPath} 重命名事件失败: ${errorMessage}`,
        oldPath,
      )
    }
  }

  /**
   * 处理文件修改事件
   * 文件修改事件失败不影响系统运行，仅记录日志
   */
  async function handleModifyEvent(path: string): Promise<void> {
    const item = getItemByPath(path)
    if (!item) {
      return
    }

    try {
      item.name = await basename(path)
      emitFileSystemEvent(item, { eventType: 'modified', path })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      void logger.error(`[FileStore] 处理 ${path} 修改事件失败: ${errorMessage}`)
    }
  }

  /**
   * 处理文件系统变更事件
   * 统一处理所有文件系统监听事件，包括创建、删除、重命名和修改
   */
  async function handleWatchEvent(event: WatchEvent): Promise<void> {
    const { type, paths } = event
    const path = paths[0]

    if (!path) {
      return
    }

    try {
      if (isEventType(type, 'create')) {
        const parentPath = await join(path, '..')
        const parentId = pathToId.get(parentPath)
        await handleCreateEvent(path, parentId)
      } else if (isEventType(type, 'remove')) {
        handleRemoveEvent(path)
      } else if (isEventType(type, 'modify')) {
        const modifyType = type as { modify: { kind?: string } }
        if (modifyType.modify.kind === 'rename') {
          const newPath = paths[1]
          if (newPath) {
            await handleRenameEvent(newPath, path)
          }
        } else {
          await handleModifyEvent(path)
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      void logger.error(`[FileStore] 处理 ${path} 文件系统事件失败: ${errorMessage}`)
      throw new FileSystemError(
        `处理 ${path} 文件系统事件失败: ${errorMessage}`,
        path,
      )
    }
  }

  // ==================== 生命周期管理 ====================

  /**
   * 清除所有状态
   */
  function clear(): void {
    items.clear()
    pathToId.clear()
    if (unwatch) {
      unwatch()
      unwatch = undefined
    }
  }

  /**
   * 初始化文件系统
   */
  async function initialize(): Promise<void> {
    if (!workspaceStore.CWD) {
      return
    }

    try {
      const rootPath = await gameRootDir(workspaceStore.CWD)
      await getFolderContents(rootPath)
      unwatch = await watchFs(rootPath, handleWatchEvent, { recursive: true, delayMs: WATCH_DELAY_MS })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      void logger.error(`[FileStore] 初始化工作目录 ${workspaceStore.CWD} 文件系统失败: ${errorMessage}`)
      throw new FileSystemError(
        `初始化工作目录 ${workspaceStore.CWD} 文件系统失败: ${errorMessage}`,
        workspaceStore.CWD,
      )
    }
  }

  // 监听工作区变化
  watch(() => workspaceStore.CWD, async (newPath) => {
    clear()
    if (newPath) {
      await initialize()
    }
  })

  return $$({
    getFolderContents,
    updateItemPath,
    clear,
    initialize,
  })
})
