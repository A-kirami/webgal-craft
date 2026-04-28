import { exists, stat, watch as watchFs } from '@tauri-apps/plugin-fs'
import { LRUCache } from 'lru-cache'
import { defineStore } from 'pinia'

import { vfsCmds } from '~/commands/vfs'
import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { mime } from '~/plugins/mime'
import { clearDirectoryItemsCache, invalidateDirectoryItemsCache, readDirectoryItemsCached } from '~/services/directory-cache'
import { gameManager } from '~/services/game-manager'
import { projectConfigPath } from '~/services/platform/app-paths'
import { useWorkspaceStore } from '~/stores/workspace'
import { AppError } from '~/types/errors'
import { FileViewerItem } from '~/types/file-viewer'
import { handleError } from '~/utils/error-handler'
import { buildUniqueEntryName, getBaseName, getParentPath, joinPath, normalizeFsPath } from '~/utils/path'

import type { WatchEvent } from '@tauri-apps/plugin-fs'
import type { VfsDirEntry, VfsSource } from '~/types/project-config'

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
  size?: number
  modifiedAt?: number
  createdAt?: number
  source?: VfsSource
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
  loadingPromise?: Promise<void>
}

export type FileSystemItem = FileItem | DirItem

type RemovedEntryKind = 'file' | 'folder' | undefined

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
  let enginePath = $ref<string>()
  let templatePath = $ref<string>()
  let projectPath = $ref<string>()

  // 外部可 await 此 Promise 以等待初始化完成
  let resolveInitialized: () => void
  let initialized = $ref<Promise<void>>(new Promise((r) => {
    resolveInitialized = r
  }))

  function getCurrentEnginePath(): string | undefined {
    return enginePath
  }

  function getCurrentProjectPath(): string | undefined {
    return workspaceStore.currentGame?.path ?? projectPath
  }

  /**
   * 刷新模板子树的 overlay 视图。
   *
   * 引擎/模板切换不会触发磁盘 watcher（lower 路径变更而非文件变更），
   * 必须主动失效 `game/template/**` 子树的 isLoaded 状态与目录缓存，
   * 并刷新 enginePath / templatePath，否则后续 listDir 仍按旧 lower 配置返回。
   *
   * @param options.nextEnginePath 切换后的引擎路径。引擎切换路径上必须显式传入，
   *   因为此时 `workspaceStore.currentGame.engineId` 仍是切换前的快照
   *   （上层 modal 在 switchEngine 返回后才会调 refreshCurrentGameSnapshot），
   *   仅靠当前 game 反查会拿到旧引擎路径。
   * @param options.nextTemplatePath 切换后的模板路径。模板切换时必须显式传入；
   *   `null` 表示回到"跟随当前引擎默认"，此时后端会从 enginePath 推导默认 template_lower。
   */
  async function refreshTemplateOverlay(
    projectPath: string,
    options: { nextEnginePath?: string, nextTemplatePath?: string | null } = {},
  ): Promise<void> {
    const currentProjectPath = getCurrentProjectPath()
    if (!currentProjectPath || normalizeFsPath(projectPath) !== normalizeFsPath(currentProjectPath)) {
      return
    }

    if (options.nextEnginePath !== undefined) {
      enginePath = options.nextEnginePath
    } else if (workspaceStore.currentGame) {
      try {
        enginePath = await gameManager.getGameEnginePath(workspaceStore.currentGame)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        void logger.warn(`[FileStore] 刷新 enginePath 失败: ${msg}`)
      }
    }

    if (options.nextTemplatePath !== undefined) {
      templatePath = options.nextTemplatePath ?? undefined
    }

    const templateRoot = joinPath(currentProjectPath, 'game', 'template')
    const normalizedTemplateRoot = normalizeFsPath(templateRoot)

    for (const item of items.values()) {
      if (!item.isDir || !item.isLoaded) {
        continue
      }

      const normalizedPath = normalizeFsPath(item.path)
      if (normalizedPath === normalizedTemplateRoot || normalizedPath.startsWith(`${normalizedTemplateRoot}/`)) {
        item.isLoaded = false
      }
    }

    await invalidateDirectoryCacheSafe(templateRoot, true)

    fileSystemEvents.emit({
      type: 'directory:modified',
      path: templateRoot,
    })
  }

  // ==================== 路径管理 ====================

  // pathToId 始终以正斜杠 key 索引：watcher 事件在 Windows 上返回反斜杠，
  // 必须 normalize 后才能与前端构造的 `/`-flavor 路径互查。
  function getOrCreateItemId(path: string): string {
    const key = normalizeFsPath(path)
    const existingId = pathToId.get(key)
    if (existingId) {
      return existingId
    }
    const newId = crypto.randomUUID()
    pathToId.set(key, newId)
    return newId
  }

  function updatePathMappings(oldPath: string, newPath: string, id: string) {
    pathToId.delete(normalizeFsPath(oldPath))
    pathToId.set(normalizeFsPath(newPath), id)
  }

  /**
   * 递归更新目录及子项的路径（用于目录重命名/移动）
   */
  function updateSubtreePaths(item: DirItem, newBasePath: string): void {
    const newPath = joinPath(newBasePath, item.name)

    const children = item.childIds
      .map(id => items.get(id))
      .filter((child): child is FileSystemItem => !!child)

    for (const child of children) {
      if (child.isDir) {
        updateSubtreePaths(child, newPath)
      } else {
        const oldPath = child.path
        child.path = joinPath(newPath, child.name)
        updatePathMappings(oldPath, child.path, child.id)
      }
    }

    const oldPath = item.path
    item.path = newPath
    updatePathMappings(oldPath, newPath, item.id)
  }

  // ==================== 文件系统项工厂 ====================

  async function createFileSystemItem(
    path: string,
    parentId: string | undefined,
  ): Promise<FileSystemItem> {
    const name = getBaseName(path)
    const id = getOrCreateItemId(path)
    const fileInfo = await stat(path)
    const metadata = {
      size: fileInfo.size,
      modifiedAt: fileInfo.mtime?.getTime(),
      createdAt: fileInfo.birthtime?.getTime(),
    }

    if (fileInfo.isDirectory) {
      return {
        id,
        name,
        path,
        parentId,
        isDir: true,
        childIds: [],
        isLoaded: false,
        ...metadata,
      }
    }

    return {
      id,
      name,
      path,
      parentId,
      isDir: false,
      mimeType: mime.getType(path) || '',
      ...metadata,
    }
  }

  function createFileSystemItemFromDirectoryEntry(
    entry: FileViewerItem,
    parentId: string | undefined,
  ): FileSystemItem {
    const id = getOrCreateItemId(entry.path)
    const metadata = {
      size: entry.size,
      modifiedAt: entry.modifiedAt,
      createdAt: entry.createdAt,
    }

    if (entry.isDir) {
      return {
        id,
        name: entry.name,
        path: entry.path,
        parentId,
        isDir: true,
        childIds: [],
        isLoaded: false,
        ...metadata,
      }
    }

    return {
      id,
      name: entry.name,
      path: entry.path,
      parentId,
      isDir: false,
      mimeType: entry.mimeType || mime.getType(entry.path) || '',
      ...metadata,
    }
  }

  function createFileSystemItemFromVfsEntry(
    entry: VfsDirEntry,
    parentPath: string,
    parentId: string | undefined,
  ): FileSystemItem {
    const path = normalizeFsPath(`${parentPath}/${entry.name}`)
    const id = getOrCreateItemId(path)

    if (entry.isDir) {
      return {
        id,
        name: entry.name,
        path,
        parentId,
        isDir: true,
        childIds: [],
        isLoaded: false,
        source: entry.source,
      }
    }

    return {
      id,
      name: entry.name,
      path,
      parentId,
      isDir: false,
      mimeType: mime.getType(path) || '',
      source: entry.source,
    }
  }

  /**
   * 刷新文件系统项元信息
   * 元信息不可用时统一置为 undefined，避免渲染层出现不一致空值
   */
  async function refreshItemMetadata(item: FileSystemItem, path: string = item.path): Promise<void> {
    const fileInfo = await stat(path)
    item.size = fileInfo.size
    item.modifiedAt = fileInfo.mtime?.getTime()
    item.createdAt = fileInfo.birthtime?.getTime()
  }

  // ==================== 父子关系 ====================

  function addChildToParent(childId: string, parentId: string | undefined): void {
    if (!parentId) {
      return
    }

    const parent = items.get(parentId)
    if (!parent?.isDir) {
      return
    }

    if (!parent.childIds.includes(childId)) {
      parent.childIds.push(childId)
    }
  }

  function removeChildFromParent(childId: string, parentId: string | undefined): void {
    if (!parentId) {
      return
    }

    const parent = items.get(parentId)
    if (parent?.isDir) {
      parent.childIds = parent.childIds.filter(id => id !== childId)
    }
  }

  // ==================== 核心操作 ====================

  async function loadDirectory(path: string, parentId?: string): Promise<void> {
    const parent = parentId ? items.get(parentId) : undefined
    if (!parent?.isDir || parent.isLoaded) {
      return
    }

    // 并发调用等待同一次加载完成
    if (parent.loadingPromise) {
      await parent.loadingPromise
      return
    }

    const loadPromise = (async () => {
      try {
        let resolvedItems: FileSystemItem[]

        if (enginePath && projectPath) {
          const entries = await vfsCmds.listDir({
            projectPath,
            enginePath,
            relPath: toRelativeProjectPath(path),
            templatePath,
          })
          resolvedItems = entries.map(entry => createFileSystemItemFromVfsEntry(entry, path, parentId))
        } else {
          const entries = await readDirectoryItemsCached(path, { includeStats: true })
          resolvedItems = entries.map(entry => createFileSystemItemFromDirectoryEntry(entry, parentId))
        }

        for (const item of resolvedItems) {
          items.set(item.id, item)
        }

        parent.childIds = resolvedItems.map(item => item.id)
        parent.isLoaded = true
      } catch (error) {
        parent.isLoaded = false
        const msg = error instanceof Error ? error.message : String(error)
        void logger.error(`[FileStore] 加载目录 ${path} 失败: ${msg}`)
        throw new AppError('FS_ERROR', `加载目录失败: ${msg}`)
      } finally {
        parent.loadingPromise = undefined
      }
    })()

    parent.loadingPromise = loadPromise
    await loadPromise
  }

  async function getFolderContents(path: string): Promise<FileSystemItem[]> {
    if (!enginePath && !(await exists(path))) {
      throw new AppError('DIR_NOT_FOUND', '目录不存在')
    }

    const key = normalizeFsPath(path)
    let parentId = pathToId.get(key)

    // LRU 脱同步：pathToId 仍持有映射但 items 已驱逐该条目
    if (parentId && !items.has(parentId)) {
      pathToId.delete(key)
      parentId = undefined
    }

    if (!parentId) {
      parentId = getOrCreateItemId(path)
      const parentDir: DirItem = {
        id: parentId,
        name: getBaseName(path),
        path,
        parentId: undefined,
        isDir: true,
        childIds: [],
        isLoaded: false,
      }
      items.set(parentId, parentDir)
    }

    const parent = items.get(parentId)
    if (!parent?.isDir) {
      throw new AppError('FS_ERROR', '路径不是目录')
    }

    if (!parent.isLoaded) {
      await loadDirectory(path, parentId)
    }

    // 清理无效的子项引用
    const previousChildCount = parent.childIds.length
    parent.childIds = parent.childIds.filter(id => items.has(id))

    // 子项全部被 LRU 驱逐，重置加载状态触发重新加载
    if (previousChildCount > 0 && parent.childIds.length === 0) {
      parent.isLoaded = false
      await loadDirectory(path, parentId)
    }

    return parent.childIds
      .map(id => items.get(id))
      .filter((item): item is FileSystemItem => !!item)
  }

  async function updateItemPath(id: string, newPath: string) {
    const item = items.get(id)
    if (!item) {
      throw new AppError('FS_ERROR', '项目不存在')
    }

    if (item.isDir) {
      await updateSubtreePaths(item, newPath)
    } else {
      const oldPath = item.path
      item.path = newPath
      updatePathMappings(oldPath, newPath, id)
    }
  }

  // ==================== 文件系统监听 ====================

  function isEventType(
    type: WatchEvent['type'],
    key: 'create' | 'remove' | 'modify',
  ): boolean {
    return typeof type === 'object' && type !== null && key in type
  }

  /**
   * 发布文件系统事件
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
      const detail = options.eventType === 'renamed'
        ? `${options.oldPath} -> ${options.newPath}`
        : options.path
      logger.debug(`[FileSystemEvent] ${prefix}:${options.eventType} - ${detail}`)
    }

    if (options.eventType === 'created') {
      fileSystemEvents.emit({ type: `${prefix}:created`, path: options.path, parentId: options.parentId })
    } else if (options.eventType === 'renamed') {
      fileSystemEvents.emit({ type: `${prefix}:renamed`, oldPath: options.oldPath, newPath: options.newPath })
    } else {
      fileSystemEvents.emit({ type: `${prefix}:${options.eventType}`, path: options.path })
    }
  }

  async function invalidateDirectoryCacheSafe(path: string, includeChildren: boolean = false): Promise<void> {
    try {
      await invalidateDirectoryItemsCache(path, { includeChildren })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      void logger.warn(`[FileStore] 失效目录缓存失败 (${path}): ${msg}`)
    }
  }

  function invalidateParentDirectoryCache(path: string): Promise<void> {
    return invalidateDirectoryCacheSafe(getParentPath(path))
  }

  function toRelativeProjectPath(path: string): string {
    if (!projectPath) {
      return ''
    }

    const normalizedProjectPath = normalizeFsPath(projectPath)
    const normalizedPath = normalizeFsPath(path)
    if (normalizedPath === normalizedProjectPath) {
      return ''
    }
    if (!normalizedPath.startsWith(`${normalizedProjectPath}/`)) {
      return ''
    }

    return normalizedPath.slice(normalizedProjectPath.length + 1)
  }

  async function prepareVfsPasteTarget(
    sourcePath: string,
    targetPath: string,
  ): Promise<{
    currentEnginePath: string
    currentProjectPath: string
    nextPath: string
    nextRelPath: string
    relSourcePath: string
  } | undefined> {
    const currentProjectPath = getCurrentProjectPath()
    const currentEnginePath = getCurrentEnginePath()
    if (!currentEnginePath || !currentProjectPath) {
      return undefined
    }

    const relSourcePath = toRelativeProjectPath(sourcePath)
    const relTargetDir = toRelativeProjectPath(targetPath)
    if (!relSourcePath || (!relTargetDir && normalizeFsPath(targetPath) !== normalizeFsPath(currentProjectPath))) {
      return undefined
    }

    const sourceName = getBaseName(sourcePath)
    const resolvedSourcePath = await vfsCmds.resolvePath({
      projectPath: currentProjectPath,
      enginePath: currentEnginePath,
      relPath: relSourcePath,
    })
    const sourceInfo = await stat(resolvedSourcePath)
    const existingItems = await getFolderContents(targetPath)
    const uniqueName = buildUniqueEntryName(
      sourceName,
      sourceInfo.isDirectory,
      new Set(existingItems.map(item => item.name)),
    )
    const nextRelPath = normalizeFsPath(relTargetDir ? `${relTargetDir}/${uniqueName}` : uniqueName)

    return {
      currentEnginePath,
      currentProjectPath,
      nextPath: normalizeFsPath(`${currentProjectPath}/${nextRelPath}`),
      nextRelPath,
      relSourcePath,
    }
  }

  async function handleCreateEvent(path: string, parentId: string | undefined): Promise<void> {
    try {
      const item = await createFileSystemItem(path, parentId)
      items.set(item.id, item)
      addChildToParent(item.id, parentId)
      emitFileSystemEvent(item, { eventType: 'created', path, parentId })
      await invalidateParentDirectoryCache(path)
      if (item.isDir) {
        await invalidateDirectoryCacheSafe(path, true)
      }
    } catch (error) {
      handleError(error, { silent: true })
    }
  }

  function getItemByPath(path: string): FileSystemItem | undefined {
    const id = pathToId.get(normalizeFsPath(path))
    return id ? items.get(id) : undefined
  }

  async function handleRemoveEvent(path: string, removedKind?: RemovedEntryKind): Promise<void> {
    const item = getItemByPath(path)
    if (!item) {
      if (removedKind === 'file' || removedKind === 'folder') {
        fileSystemEvents.emit({
          type: removedKind === 'folder' ? 'directory:removed' : 'file:removed',
          path,
        })
      }
      await invalidateParentDirectoryCache(path)
      await invalidateDirectoryCacheSafe(path, true)
      return
    }

    removeChildFromParent(item.id, item.parentId)
    items.delete(item.id)
    pathToId.delete(normalizeFsPath(path))

    emitFileSystemEvent(item, { eventType: 'removed', path })
    await invalidateParentDirectoryCache(path)
    await invalidateDirectoryCacheSafe(path, true)
  }

  /**
   * 处理目录重命名：递归更新所有子项路径
   */
  async function handleRenameEvent(newPath: string, oldPath: string): Promise<void> {
    const item = getItemByPath(oldPath)
    if (!item) {
      const renamedFileInfo = await stat(newPath)
      fileSystemEvents.emit({
        type: renamedFileInfo.isDirectory ? 'directory:renamed' : 'file:renamed',
        oldPath,
        newPath,
      })
      await Promise.all([
        invalidateDirectoryCacheSafe(getParentPath(oldPath)),
        invalidateDirectoryCacheSafe(getParentPath(newPath)),
        invalidateDirectoryCacheSafe(oldPath, true),
        invalidateDirectoryCacheSafe(newPath, true),
      ])
      return
    }

    try {
      const originalPath = item.path
      item.name = getBaseName(newPath)

      if (item.isDir) {
        updateSubtreePaths(item, getParentPath(newPath))
      } else {
        item.path = newPath
        updatePathMappings(originalPath, newPath, item.id)
      }

      await refreshItemMetadata(item, newPath)

      emitFileSystemEvent(item, { eventType: 'renamed', oldPath, newPath })
      await Promise.all([
        invalidateDirectoryCacheSafe(getParentPath(oldPath)),
        invalidateDirectoryCacheSafe(getParentPath(newPath)),
        invalidateDirectoryCacheSafe(oldPath, true),
        invalidateDirectoryCacheSafe(newPath, true),
      ])
    } catch (error) {
      handleError(error, { silent: true })
    }
  }

  async function handleModifyEvent(path: string): Promise<void> {
    const item = getItemByPath(path)

    // 未被资源浏览器加载的文件/目录：仅发送事件通知，跳过元数据更新
    if (!item) {
      try {
        const info = await stat(path)
        fileSystemEvents.emit({
          type: info.isDirectory ? 'directory:modified' : 'file:modified',
          path,
        })
      } catch {
        // 文件可能已被删除或不可访问，忽略
      }
      return
    }

    try {
      item.name = getBaseName(path)
      await refreshItemMetadata(item, path)
      emitFileSystemEvent(item, { eventType: 'modified', path })
      await invalidateParentDirectoryCache(path)
      if (item.isDir) {
        await invalidateDirectoryCacheSafe(path, true)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      void logger.error(`[FileStore] 处理 ${path} 修改事件失败: ${msg}`)
    }
  }

  async function handleWatchEvent(event: WatchEvent): Promise<void> {
    const { type, paths } = event
    const path = paths[0]

    if (!path) {
      return
    }

    try {
      if (isEventType(type, 'create')) {
        const parentPath = getParentPath(path)
        const parentId = pathToId.get(parentPath)
        await handleCreateEvent(path, parentId)
      } else if (isEventType(type, 'remove')) {
        const removeType = type as { remove?: { kind?: RemovedEntryKind | 'any' | 'other' } }
        const removedKind = removeType.remove?.kind
        await handleRemoveEvent(
          path,
          removedKind === 'file' || removedKind === 'folder' ? removedKind : undefined,
        )
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
      handleError(error, { silent: true })
    }
  }

  // ==================== 生命周期 ====================

  function clear(): void {
    items.clear()
    pathToId.clear()
    clearDirectoryItemsCache()
    enginePath = undefined
    templatePath = undefined
    projectPath = undefined
    initialized = new Promise((r) => {
      resolveInitialized = r
    })
    if (unwatch) {
      unwatch()
      unwatch = undefined
    }
  }

  async function initialize(): Promise<void> {
    if (!workspaceStore.CWD) {
      return
    }
    if (unwatch) {
      return
    }

    try {
      projectPath = workspaceStore.currentGame?.path
      const configPath = projectPath ? await projectConfigPath(projectPath) : undefined
      const hasProjectConfig = configPath ? await exists(configPath) : false
      if (hasProjectConfig && workspaceStore.currentGame) {
        try {
          const site = await gameManager.resolvePreviewSite(workspaceStore.currentGame)
          enginePath = site.enginePath
          templatePath = site.templatePath
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          void logger.warn(`[FileStore] 解析项目站点失败，回退仅引擎路径: ${msg}`)
          enginePath = await gameManager.getGameEnginePath(workspaceStore.currentGame)
          templatePath = undefined
        }
      } else {
        enginePath = undefined
        templatePath = undefined
      }

      const rootPath = joinPath(workspaceStore.CWD, 'game')
      await getFolderContents(rootPath)
      unwatch = await watchFs(rootPath, handleWatchEvent, { recursive: true, delayMs: WATCH_DELAY_MS })
      resolveInitialized()
    } catch (error) {
      resolveInitialized()
      const msg = error instanceof Error ? error.message : String(error)
      void logger.error(`[FileStore] 初始化工作目录 ${workspaceStore.CWD} 文件系统失败: ${msg}`)
      throw new AppError('FS_ERROR', `初始化工作目录 ${workspaceStore.CWD} 文件系统失败: ${msg}`)
    }
  }

  // 监听工作区变化
  watch(() => workspaceStore.CWD, async (newPath) => {
    clear()
    if (newPath) {
      await initialize().catch(() => {
        // initialize 已记录详细错误；这里避免 immediate watcher 产生未处理 Promise，
        // 保持 store 可继续创建，后续工作区切换仍可重新触发初始化。
      })
    }
  }, { immediate: true })

  const isVfs = $computed(() => !!enginePath)

  return $$({
    deleteEntry: async (path: string): Promise<boolean> => {
      const currentProjectPath = getCurrentProjectPath()
      const currentEnginePath = getCurrentEnginePath()
      if (!currentEnginePath || !currentProjectPath) {
        return false
      }

      const relPath = toRelativeProjectPath(path)
      if (!relPath) {
        return false
      }

      await vfsCmds.deletePath({
        projectPath: currentProjectPath,
        enginePath: currentEnginePath,
        relPath,
      })
      await handleRemoveEvent(path)
      return true
    },
    copyEntry: async (sourcePath: string, targetPath: string): Promise<string | undefined> => {
      const moveTarget = await prepareVfsPasteTarget(sourcePath, targetPath)
      if (!moveTarget) {
        return undefined
      }

      const copiedRelPath = await vfsCmds.copyPath({
        projectPath: moveTarget.currentProjectPath,
        enginePath: moveTarget.currentEnginePath,
        relPath: moveTarget.relSourcePath,
        targetRelPath: moveTarget.nextRelPath,
      })
      const nextPath = normalizeFsPath(`${moveTarget.currentProjectPath}/${copiedRelPath}`)
      await handleCreateEvent(nextPath, pathToId.get(normalizeFsPath(targetPath)))
      return nextPath
    },
    ensureWritable: async (path: string): Promise<string> => {
      const currentProjectPath = getCurrentProjectPath()
      const currentEnginePath = getCurrentEnginePath()
      if (!currentEnginePath || !currentProjectPath) {
        return path
      }

      const relPath = toRelativeProjectPath(path)
      if (!relPath) {
        return path
      }

      return await vfsCmds.ensureWritable({
        projectPath: currentProjectPath,
        enginePath: currentEnginePath,
        relPath,
      })
    },
    getFolderContents,
    initialized,
    updateItemPath,
    isVfs,
    moveEntry: async (sourcePath: string, targetPath: string): Promise<string | undefined> => {
      const moveTarget = await prepareVfsPasteTarget(sourcePath, targetPath)
      if (!moveTarget) {
        return undefined
      }

      const movedRelPath = await vfsCmds.movePath({
        projectPath: moveTarget.currentProjectPath,
        enginePath: moveTarget.currentEnginePath,
        relPath: moveTarget.relSourcePath,
        targetRelPath: moveTarget.nextRelPath,
      })
      const nextPath = normalizeFsPath(`${moveTarget.currentProjectPath}/${movedRelPath}`)
      const targetParentId = getItemByPath(targetPath)?.id
      const sourceParentPath = normalizeFsPath(getParentPath(sourcePath))
      if (sourceParentPath === normalizeFsPath(targetPath)) {
        await handleRenameEvent(nextPath, sourcePath)
      } else {
        await handleRemoveEvent(sourcePath)
        await handleCreateEvent(nextPath, targetParentId)
      }
      return nextPath
    },
    renameEntry: async (path: string, newName: string): Promise<string | undefined> => {
      const currentProjectPath = getCurrentProjectPath()
      const currentEnginePath = getCurrentEnginePath()
      if (!currentEnginePath || !currentProjectPath) {
        return undefined
      }

      const relPath = toRelativeProjectPath(path)
      if (!relPath) {
        return undefined
      }

      const nextRelPath = await vfsCmds.renamePath({
        projectPath: currentProjectPath,
        enginePath: currentEnginePath,
        relPath,
        newName,
      })
      const nextPath = normalizeFsPath(`${currentProjectPath}/${nextRelPath}`)
      await handleRenameEvent(nextPath, path)
      return nextPath
    },
    resolveFilePath: async (path: string): Promise<string> => {
      const currentProjectPath = getCurrentProjectPath()
      const currentEnginePath = getCurrentEnginePath()
      if (!currentEnginePath || !currentProjectPath) {
        return path
      }

      const relPath = toRelativeProjectPath(path)
      if (!relPath) {
        return path
      }

      return await vfsCmds.resolvePath({
        projectPath: currentProjectPath,
        enginePath: currentEnginePath,
        relPath,
      })
    },
    clear,
    initialize,
    refreshTemplateOverlay,
  })
})
