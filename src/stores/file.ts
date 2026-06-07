import { exists, readFile, stat, watch as watchFs } from '@tauri-apps/plugin-fs'
import { LRUCache } from 'lru-cache'
import { defineStore } from 'pinia'

import { vfsCmds } from '~/commands/vfs'
import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { AbsPath, RelPath } from '~/domain/path'
import { mime } from '~/plugins/mime'
import { clearDirectoryItemsCache, invalidateDirectoryItemsCache, readDirectoryItemsCached } from '~/services/directory-cache'
import { hasPendingFileWrite, matchesPendingFileWrite } from '~/services/file-write-echo-registry'
import { gameManager } from '~/services/game-manager'
import { pathOperationRegistry } from '~/services/path-operation-registry'
import { projectConfigPath } from '~/services/platform/app-paths'
import { useWorkspaceStore } from '~/stores/workspace'
import { AppError } from '~/types/errors'
import { FileViewerItem } from '~/types/file-viewer'
import { buildUniqueEntryName } from '~/utils/entry-name'
import { handleError } from '~/utils/error-handler'

import type { WatchEvent } from '@tauri-apps/plugin-fs'
import type { VfsDirEntry, VfsSource } from '~/types/project-config'

/**
 * 最大缓存项数
 */
const MAX_CACHE_ITEMS = 5000

/**
 * 文件系统监听延迟（毫秒）
 */
const WATCH_DELAY_MS = 150
const PENDING_WRITE_STABILITY_DELAY_MS = 10
const PENDING_WRITE_STABILITY_MAX_READS = 3

/**
 * 文件系统项的基础接口
 */
interface FileSystemItemBase {
  id: string
  name: string
  path: AbsPath
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
  loadRevision: number
  loadingRevision?: number
  loadingPromise?: Promise<void>
}

export type FileSystemItem = FileItem | DirItem

type RemovedEntryKind = 'file' | 'folder' | undefined

function areBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false
  }

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

async function delay(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function readStableFileBytes(
  path: AbsPath,
  previousBytes: Uint8Array,
  remainingReads: number,
): Promise<Uint8Array> {
  if (remainingReads === 0) {
    return previousBytes
  }

  await delay(PENDING_WRITE_STABILITY_DELAY_MS)
  const nextBytes = await readFile(path)
  if (areBytesEqual(previousBytes, nextBytes)) {
    return nextBytes
  }

  return await readStableFileBytes(path, nextBytes, remainingReads - 1)
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

  const pathToId = $ref<LRUCache<AbsPath, string>>(new LRUCache({
    max: MAX_CACHE_ITEMS,
    updateAgeOnGet: true,
    updateAgeOnHas: true,
  }))

  const fileSystemEvents = useFileSystemEvents()
  const workspaceStore = useWorkspaceStore()
  let unwatch: (() => void) | undefined
  let enginePath = $ref<AbsPath>()
  let templatePath = $ref<AbsPath>()
  let projectPath = $ref<AbsPath>()

  // 外部可 await 此 Promise 以等待初始化完成
  let resolveInitialized: () => void
  let initialized = $ref<Promise<void>>(new Promise((r) => {
    resolveInitialized = r
  }))

  function getCurrentEnginePath(): AbsPath | undefined {
    return enginePath
  }

  function getCurrentProjectPath(): AbsPath | undefined {
    return workspaceStore.currentGame?.path ?? projectPath
  }

  function getCurrentTemplatePath(): AbsPath | undefined {
    return templatePath
  }

  function isPathWithinOrEqual(path: AbsPath, root: AbsPath): boolean {
    if (AbsPath.equals(path, root)) {
      return true
    }

    try {
      AbsPath.relativize(path, root)
      return true
    } catch {
      return false
    }
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
    projectPath: AbsPath,
    options: { nextEnginePath?: AbsPath, nextTemplatePath?: AbsPath | null } = {},
  ): Promise<void> {
    const currentProjectPath = getCurrentProjectPath()
    if (!currentProjectPath || !AbsPath.equals(projectPath, currentProjectPath)) {
      return
    }

    if (options.nextEnginePath !== undefined) {
      enginePath = options.nextEnginePath
    } else if (workspaceStore.currentGame) {
      try {
        const nextEnginePath = await gameManager.getGameEnginePath(workspaceStore.currentGame)
        enginePath = nextEnginePath
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        void logger.warn(`[FileStore] 刷新 enginePath 失败: ${msg}`)
      }
    }

    if (options.nextTemplatePath !== undefined) {
      templatePath = options.nextTemplatePath ?? undefined
    }

    const templateRoot = AbsPath.join(currentProjectPath, RelPath.from('game/template'))

    for (const item of items.values()) {
      if (!item.isDir) {
        continue
      }

      if (isPathWithinOrEqual(item.path, templateRoot)) {
        item.loadRevision += 1
        item.isLoaded = false
        item.loadingRevision = undefined
        item.loadingPromise = undefined
      }
    }

    await invalidateDirectoryCacheSafe(templateRoot, true)

    // 失效父 game 目录：`game/template` 的 source/existence 字段是在加载父目录时
    // 写入的，只刷新模板子树自身无法让父目录下次重渲染时看到新 lower 配置。
    const parentGameDir = AbsPath.join(currentProjectPath, RelPath.from('game'))
    const parentItem = getItemByPath(parentGameDir)
    if (parentItem?.isDir) {
      parentItem.loadRevision += 1
      parentItem.isLoaded = false
      parentItem.loadingRevision = undefined
      parentItem.loadingPromise = undefined
    }
    await invalidateDirectoryCacheSafe(parentGameDir, true)

    fileSystemEvents.emit({
      type: 'directory:modified',
      path: templateRoot,
    })
  }

  // ==================== 路径管理 ====================

  function getOrCreateItemId(path: AbsPath): string {
    const existingId = pathToId.get(path)
    if (existingId) {
      return existingId
    }
    const newId = crypto.randomUUID()
    pathToId.set(path, newId)
    return newId
  }

  function updatePathMappings(oldPath: AbsPath, newPath: AbsPath, id: string) {
    pathToId.delete(oldPath)
    pathToId.set(newPath, id)
  }

  /**
   * 递归更新目录及子项的路径（用于目录重命名/移动）
   */
  function updateSubtreePaths(item: DirItem, newBasePath: AbsPath): void {
    const newPath = AbsPath.append(newBasePath, item.name)

    const children = item.childIds
      .map(id => items.get(id))
      .filter((child): child is FileSystemItem => !!child)

    for (const child of children) {
      if (child.isDir) {
        updateSubtreePaths(child, newPath)
      } else {
        const oldPath = child.path
        child.path = AbsPath.append(newPath, child.name)
        updatePathMappings(oldPath, child.path, child.id)
      }
    }

    const oldPath = item.path
    item.path = newPath
    updatePathMappings(oldPath, newPath, item.id)
  }

  // ==================== 文件系统项工厂 ====================

  async function createFileSystemItem(
    path: AbsPath,
    parentId: string | undefined,
  ): Promise<FileSystemItem> {
    const name = AbsPath.basename(path)
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
        loadRevision: 0,
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
    const entryPath = AbsPath.from(entry.path)
    const id = getOrCreateItemId(entryPath)
    const metadata = {
      size: entry.size,
      modifiedAt: entry.modifiedAt,
      createdAt: entry.createdAt,
    }

    if (entry.isDir) {
      return {
        id,
        name: entry.name,
        path: entryPath,
        parentId,
        isDir: true,
        childIds: [],
        isLoaded: false,
        loadRevision: 0,
        ...metadata,
      }
    }

    return {
      id,
      name: entry.name,
      path: entryPath,
      parentId,
      isDir: false,
      mimeType: entry.mimeType || mime.getType(entry.path) || '',
      ...metadata,
    }
  }

  function createFileSystemItemFromVfsEntry(entry: VfsDirEntry, parentPath: AbsPath, parentId: string | undefined): FileSystemItem {
    const path = AbsPath.append(parentPath, entry.name)
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
        loadRevision: 0,
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
  async function refreshItemMetadata(item: FileSystemItem, path: AbsPath = item.path): Promise<void> {
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

  async function loadDirectory(path: AbsPath, parentId?: string): Promise<void> {
    const parent = parentId ? items.get(parentId) : undefined
    if (!parent?.isDir || parent.isLoaded) {
      return
    }

    // 并发调用等待同一次加载完成
    if (parent.loadingPromise) {
      await parent.loadingPromise
      return
    }

    const { loadRevision } = parent
    parent.loadingRevision = loadRevision
    const loadPromise = (async () => {
      try {
        let resolvedItems: FileSystemItem[]
        const currentTemplatePath = getCurrentTemplatePath()

        if (enginePath && projectPath) {
          const entries = await vfsCmds.listDir({
            projectPath,
            enginePath,
            relPath: toRelativeProjectPath(path),
            templatePath: currentTemplatePath,
          })
          resolvedItems = entries.map(entry => createFileSystemItemFromVfsEntry(entry, path, parentId))
        } else {
          const entries = await readDirectoryItemsCached(path, { includeStats: true })
          resolvedItems = entries.map(entry => createFileSystemItemFromDirectoryEntry(entry, parentId))
        }

        if (parent.loadRevision !== loadRevision) {
          return
        }

        for (const item of resolvedItems) {
          items.set(item.id, item)
        }

        parent.childIds = resolvedItems.map(item => item.id)
        parent.isLoaded = true
      } catch (error) {
        if (parent.loadRevision !== loadRevision) {
          return
        }

        parent.isLoaded = false
        const msg = error instanceof Error ? error.message : String(error)
        void logger.error(`[FileStore] 加载目录 ${path} 失败: ${msg}`)
        throw new AppError('FS_ERROR', `加载目录失败: ${msg}`)
      } finally {
        if (parent.loadingRevision === loadRevision) {
          parent.loadingRevision = undefined
          parent.loadingPromise = undefined
        }
      }
    })()

    parent.loadingPromise = loadPromise
    await loadPromise
  }

  async function getFolderContents(path: AbsPath): Promise<FileSystemItem[]> {
    if (!enginePath && !(await exists(path))) {
      throw new AppError('DIR_NOT_FOUND', '目录不存在')
    }

    let parentId = pathToId.get(path)

    // LRU 脱同步：pathToId 仍持有映射但 items 已驱逐该条目
    if (parentId && !items.has(parentId)) {
      pathToId.delete(path)
      parentId = undefined
    }

    if (!parentId) {
      parentId = getOrCreateItemId(path)
      const parentDir: DirItem = {
        id: parentId,
        name: AbsPath.basename(path),
        path,
        parentId: undefined,
        isDir: true,
        childIds: [],
        isLoaded: false,
        loadRevision: 0,
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

    // 子项被 LRU 驱逐时重置加载状态，避免渲染半残列表
    if (previousChildCount !== parent.childIds.length) {
      parent.isLoaded = false
      await loadDirectory(path, parentId)
    }

    return parent.childIds
      .map(id => items.get(id))
      .filter((item): item is FileSystemItem => !!item)
  }

  async function updateItemPath(id: string, newPath: AbsPath) {
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
      | { eventType: 'created', path: AbsPath, parentId?: string }
      | { eventType: 'removed', path: AbsPath }
      | { eventType: 'renamed', oldPath: AbsPath, newPath: AbsPath }
      | { eventType: 'modified', path: AbsPath },
  ): void {
    const prefix = item.isDir ? 'directory' : 'file'

    if (options.eventType === 'created') {
      fileSystemEvents.emit({ type: `${prefix}:created`, path: options.path, parentId: options.parentId })
    } else if (options.eventType === 'renamed') {
      fileSystemEvents.emit({
        type: `${prefix}:renamed`,
        oldPath: options.oldPath,
        newPath: options.newPath,
        source: 'external',
      })
    } else {
      fileSystemEvents.emit({
        type: `${prefix}:${options.eventType}`,
        path: options.path,
        ...(options.eventType === 'modified' ? { source: 'external' as const } : {}),
      })
    }
  }

  async function invalidateDirectoryCacheSafe(path: AbsPath, includeChildren: boolean = false): Promise<void> {
    try {
      await invalidateDirectoryItemsCache(path, { includeChildren })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      void logger.warn(`[FileStore] 失效目录缓存失败 (${path}): ${msg}`)
    }
  }

  function invalidateParentDirectoryCache(path: AbsPath): Promise<void> {
    return invalidateDirectoryCacheSafe(AbsPath.parent(path))
  }

  async function invalidatePathOperationCaches(oldPath: AbsPath, newPath: AbsPath): Promise<void> {
    await Promise.all([
      invalidateDirectoryCacheSafe(AbsPath.parent(oldPath)),
      invalidateDirectoryCacheSafe(AbsPath.parent(newPath)),
      invalidateDirectoryCacheSafe(oldPath, true),
      invalidateDirectoryCacheSafe(newPath, true),
    ])
  }

  function toRelativeProjectPath(path: AbsPath): RelPath {
    if (!projectPath) {
      return RelPath.empty()
    }

    try {
      return AbsPath.relativize(path, projectPath)
    } catch {
      return RelPath.empty()
    }
  }

  async function prepareVfsPasteTarget(
    sourcePath: AbsPath,
    targetPath: AbsPath,
  ): Promise<{
    currentEnginePath: AbsPath
    currentProjectPath: AbsPath
    nextPath: AbsPath
    nextRelPath: RelPath
    relSourcePath: RelPath
  } | undefined> {
    const currentProjectPath = getCurrentProjectPath()
    const currentEnginePath = getCurrentEnginePath()
    const currentTemplatePath = getCurrentTemplatePath()
    if (!currentEnginePath || !currentProjectPath) {
      return undefined
    }

    const relSourcePath = toRelativeProjectPath(sourcePath)
    const relTargetDir = toRelativeProjectPath(targetPath)
    if (
      RelPath.equals(relSourcePath, RelPath.empty())
      || (
        RelPath.equals(relTargetDir, RelPath.empty())
        && !AbsPath.equals(targetPath, currentProjectPath)
      )
    ) {
      return undefined
    }

    const sourceName = AbsPath.basename(sourcePath)
    const resolvedSourcePath = await vfsCmds.resolvePath({
      projectPath: currentProjectPath,
      enginePath: currentEnginePath,
      templatePath: currentTemplatePath,
      relPath: relSourcePath,
    })
    const sourceInfo = await stat(resolvedSourcePath)
    const existingItems = await getFolderContents(targetPath)
    const uniqueName = buildUniqueEntryName(
      sourceName,
      sourceInfo.isDirectory,
      new Set(existingItems.map(item => item.name)),
    )
    const nextRelPath = RelPath.append(relTargetDir, uniqueName)

    return {
      currentEnginePath,
      currentProjectPath,
      nextPath: AbsPath.join(currentProjectPath, nextRelPath),
      nextRelPath,
      relSourcePath,
    }
  }

  async function handleCreateEvent(path: AbsPath, parentId: string | undefined): Promise<void> {
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

  function getItemByPath(path: AbsPath): FileSystemItem | undefined {
    const id = pathToId.get(path)
    return id ? items.get(id) : undefined
  }

  async function applyPathMutation(oldPath: AbsPath, newPath: AbsPath): Promise<void> {
    const item = getItemByPath(oldPath)
    if (!item) {
      await invalidatePathOperationCaches(oldPath, newPath)
      return
    }

    const oldParentId = item.parentId
    const newParentId = pathToId.get(AbsPath.parent(newPath))
    if (oldParentId !== newParentId) {
      removeChildFromParent(item.id, oldParentId)
      item.parentId = newParentId
      addChildToParent(item.id, newParentId)
    }

    item.name = AbsPath.basename(newPath)

    if (item.isDir) {
      updateSubtreePaths(item, AbsPath.parent(newPath))
    } else {
      item.path = newPath
      item.mimeType = mime.getType(newPath) || ''
      updatePathMappings(oldPath, newPath, item.id)
    }

    await refreshItemMetadata(item, newPath)
    await invalidatePathOperationCaches(oldPath, newPath)
  }

  async function handleRemoveEvent(path: AbsPath, removedKind?: RemovedEntryKind): Promise<void> {
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
    pathToId.delete(path)

    emitFileSystemEvent(item, { eventType: 'removed', path })
    await invalidateParentDirectoryCache(path)
    await invalidateDirectoryCacheSafe(path, true)
  }

  /**
   * 处理重命名事件：目录会递归更新子项路径，文件只更新自身路径。
   */
  async function handleRenameEvent(newPath: AbsPath, oldPath: AbsPath): Promise<void> {
    if (pathOperationRegistry.consumeRenameEcho(oldPath, newPath)) {
      await invalidatePathOperationCaches(oldPath, newPath)
      return
    }

    const item = getItemByPath(oldPath)
    if (!item) {
      const renamedFileInfo = await stat(newPath)
      fileSystemEvents.emit({
        type: renamedFileInfo.isDirectory ? 'directory:renamed' : 'file:renamed',
        oldPath,
        newPath,
        source: 'external',
      })
      await invalidatePathOperationCaches(oldPath, newPath)
      return
    }

    try {
      await applyPathMutation(oldPath, newPath)
      emitFileSystemEvent(item, { eventType: 'renamed', oldPath, newPath })
    } catch (error) {
      handleError(error, { silent: true })
    }
  }

  async function handleModifyEvent(path: AbsPath): Promise<void> {
    const item = getItemByPath(path)

    if (await handlePendingWriteEcho(path, item)) {
      return
    }

    const pendingOperation = pathOperationRegistry.lookupPathOperationByPath(path)
    if (pendingOperation) {
      await invalidatePathOperationCaches(pendingOperation.sourcePath, pendingOperation.targetPath)
      return
    }

    // 未被资源浏览器加载的文件/目录：仅发送事件通知，跳过元数据更新
    if (!item) {
      try {
        const info = await stat(path)
        fileSystemEvents.emit({
          type: info.isDirectory ? 'directory:modified' : 'file:modified',
          path,
          source: 'external',
        })
      } catch {
        // 文件可能已被删除或不可访问，忽略
      }
      return
    }

    try {
      item.name = AbsPath.basename(path)
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

  async function handlePendingWriteEcho(
    path: AbsPath,
    item: FileSystemItem | undefined,
  ): Promise<boolean> {
    if (!hasPendingFileWrite(path) || item?.isDir) {
      return false
    }

    let currentBytes: Uint8Array
    try {
      const firstBytes = await readFile(path)
      currentBytes = await readStableFileBytes(path, firstBytes, PENDING_WRITE_STABILITY_MAX_READS - 1)
    } catch {
      return false
    }

    if (!matchesPendingFileWrite(path, currentBytes)) {
      return false
    }

    try {
      if (item) {
        item.name = AbsPath.basename(path)
        await refreshItemMetadata(item, path)
      }
      fileSystemEvents.emit({
        type: 'file:written',
        path,
        source: 'system-refactor',
      })
      await invalidateParentDirectoryCache(path)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      void logger.error(`[FileStore] 处理 ${path} 自写入回响失败: ${msg}`)
    }

    return true
  }

  async function handleWatchEvent(event: WatchEvent): Promise<void> {
    const { type } = event
    const paths = event.paths.map(p => AbsPath.from(p))
    const path = paths[0]

    if (!path) {
      return
    }

    try {
      if (isEventType(type, 'create')) {
        const parentPath = AbsPath.parent(path)
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
      const configPath = projectPath ? projectConfigPath(projectPath) : undefined
      const hasProjectConfig = configPath ? await exists(configPath) : false
      if (hasProjectConfig && workspaceStore.currentGame) {
        try {
          const site = await gameManager.resolvePreviewSite(workspaceStore.currentGame)
          enginePath = site.enginePath
          templatePath = site.templatePath
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          void logger.warn(`[FileStore] 解析项目站点失败，回退仅引擎路径: ${msg}`)
          const fallbackEnginePath = await gameManager.getGameEnginePath(workspaceStore.currentGame)
          enginePath = fallbackEnginePath
          templatePath = undefined
        }
      } else {
        enginePath = undefined
        templatePath = undefined
      }

      const rootPath = AbsPath.join(AbsPath.from(workspaceStore.CWD), RelPath.from('game'))
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
    } else {
      // 无工作区时不会触发 initialize，立即兑现 initialized，避免外部 await 永久挂起
      resolveInitialized()
    }
  }, { immediate: true })

  const isVfs = $computed(() => !!enginePath)

  return $$({
    deleteEntry: async (path: AbsPath): Promise<boolean> => {
      const currentProjectPath = getCurrentProjectPath()
      const currentEnginePath = getCurrentEnginePath()
      const currentTemplatePath = getCurrentTemplatePath()
      if (!currentEnginePath || !currentProjectPath) {
        return false
      }

      const relPath = toRelativeProjectPath(path)
      if (RelPath.equals(relPath, RelPath.empty())) {
        return false
      }

      await vfsCmds.deletePath({
        projectPath: currentProjectPath,
        enginePath: currentEnginePath,
        templatePath: currentTemplatePath,
        relPath,
      })
      await handleRemoveEvent(path)
      return true
    },
    copyEntry: async (sourcePath: AbsPath, targetPath: AbsPath): Promise<AbsPath | undefined> => {
      const moveTarget = await prepareVfsPasteTarget(sourcePath, targetPath)
      if (!moveTarget) {
        return undefined
      }

      const copiedRelPath = await vfsCmds.copyPath({
        projectPath: moveTarget.currentProjectPath,
        enginePath: moveTarget.currentEnginePath,
        templatePath: getCurrentTemplatePath(),
        relPath: moveTarget.relSourcePath,
        targetRelPath: moveTarget.nextRelPath,
      })
      const nextPath = AbsPath.join(moveTarget.currentProjectPath, copiedRelPath)
      await handleCreateEvent(nextPath, getItemByPath(targetPath)?.id)
      return nextPath
    },
    ensureWritable: async (path: AbsPath): Promise<AbsPath> => {
      const currentProjectPath = getCurrentProjectPath()
      const currentEnginePath = getCurrentEnginePath()
      const currentTemplatePath = getCurrentTemplatePath()
      if (!currentEnginePath || !currentProjectPath) {
        return path
      }

      const relPath = toRelativeProjectPath(path)
      if (RelPath.equals(relPath, RelPath.empty())) {
        return path
      }

      return await vfsCmds.ensureWritable({
        projectPath: currentProjectPath,
        enginePath: currentEnginePath,
        templatePath: currentTemplatePath,
        relPath,
      })
    },
    getFolderContents,
    initialized,
    updateItemPath,
    isVfs,
    applyPathMutation,
    invalidatePathOperationCaches,
    resolveFilePath: async (path: AbsPath): Promise<AbsPath> => {
      const currentProjectPath = getCurrentProjectPath()
      const currentEnginePath = getCurrentEnginePath()
      const currentTemplatePath = getCurrentTemplatePath()
      if (!currentEnginePath || !currentProjectPath) {
        return path
      }

      const relPath = toRelativeProjectPath(path)
      if (RelPath.equals(relPath, RelPath.empty())) {
        return path
      }

      return await vfsCmds.resolvePath({
        projectPath: currentProjectPath,
        enginePath: currentEnginePath,
        templatePath: currentTemplatePath,
        relPath,
      })
    },
    clear,
    getItemByPath,
    initialize,
    refreshItemMetadata: async (path: AbsPath): Promise<void> => {
      const item = getItemByPath(path)
      if (!item) {
        return
      }
      await refreshItemMetadata(item, path)
    },
    refreshTemplateOverlay,
  })
})
