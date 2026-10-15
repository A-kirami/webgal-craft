import { readFile, stat, watch as watchFs } from '@tauri-apps/plugin-fs'
import { LRUCache } from 'lru-cache'
import { defineStore } from 'pinia'

import { vfsCmds } from '~/commands/vfs'
import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { AbsPath, RelPath } from '~/domain/path'
import { mime } from '~/plugins/mime'
import { clearDirectoryItemsCache, invalidateDirectoryItemsCache } from '~/services/directory-cache'
import { hasPendingFileWrite, matchesPendingFileWrite } from '~/services/file-write-echo-registry'
import { gameManager } from '~/services/game-manager'
import { pathOperationRegistry } from '~/services/path-operation-registry'
import { useWorkspaceStore } from '~/stores/workspace'
import { AppError } from '~/types/errors'
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

  /**
   * 文件视图的初始化代次。工作区每变一次就作废上一代：迟到的引擎解析、目录列举与 watcher 挂载
   * 都属于上一代，既不能再写状态、挂监听，也不能兑现新一代的 initialized——否则消费者会拿着
   * 上一个工作区（或尚未就绪）的结果当成就绪。
   */
  interface InitializationHandle {
    generation: number
    promise: Promise<void>
    resolve: () => void
  }

  let initializationGeneration = 0

  function createInitialization(generation: number): InitializationHandle {
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    return { generation, promise, resolve }
  }

  let currentInitialization = createInitialization(0)
  // 外部可 await 此 Promise 以等待当前工作区的初始化完成
  let initialized = $ref<Promise<void>>(currentInitialization.promise)

  /** 开启新一代初始化：上一代立即兑现，避免持有旧 Promise 的消费者永久挂起 */
  function startInitialization(): InitializationHandle {
    const previous = currentInitialization
    initializationGeneration += 1
    currentInitialization = createInitialization(initializationGeneration)
    initialized = currentInitialization.promise
    previous.resolve()
    return currentInitialization
  }

  /** 当前代次是否仍是调用方启动时那一代 */
  function isCurrentInitialization(handle: InitializationHandle): boolean {
    return handle.generation === initializationGeneration
  }

  interface VfsContext {
    projectPath: AbsPath
    enginePath: AbsPath
    templatePath: AbsPath | undefined
  }

  /**
   * VFS 上下文：项目 upper + 引擎 lower + 可选模板 lower。
   * 项目未打开或引擎不可用时没有上下文，此时文件视图操作直接失败，不回退到物理路径。
   */
  function requireVfsContext(): VfsContext {
    if (!projectPath || !enginePath) {
      throw new AppError('FS_ERROR', '当前项目没有可用的引擎，无法解析文件视图')
    }

    return { projectPath, enginePath, templatePath }
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
   *   仅靠当前 game 反查会拿到旧引擎路径。传入后模板层默认回到新引擎的默认模板。
   * @param options.nextTemplatePath 切换后的模板路径。模板切换时必须显式传入；
   *   `null` 表示回到"跟随当前引擎默认"，此时后端会从 enginePath 推导默认 template_lower。
   *   两个层都省略时按当前游戏快照重新解析。
   */
  async function refreshTemplateOverlay(
    gamePath: AbsPath,
    options: { nextEnginePath?: AbsPath, nextTemplatePath?: AbsPath | null } = {},
  ): Promise<void> {
    const game = workspaceStore.currentGame
    if (!projectPath || !game || !AbsPath.equals(gamePath, projectPath)) {
      return
    }

    const handle = currentInitialization

    if (options.nextEnginePath === undefined) {
      // 引擎未变：按当前游戏快照重新解析（切换流程的快照可能落后，由调用方显式传入）
      const site = await gameManager.resolvePreviewSite(game)
      if (!isCurrentInitialization(handle)) {
        // 解析期间工作区已切换：这次刷新属于上一个工程，不能再写文件视图状态
        return
      }

      enginePath = site.enginePath
      templatePath = options.nextTemplatePath === undefined
        ? site.templatePath
        : options.nextTemplatePath ?? undefined
    } else {
      // 引擎已切换：模板未显式给出时回到新引擎的默认模板
      enginePath = options.nextEnginePath
      templatePath = options.nextTemplatePath ?? undefined
    }

    // 引擎不可用时不会建立文件树；切换到可用引擎后在这里补建，并通知订阅者重读
    if (!unwatch) {
      const rootPath = projectGameRoot(projectPath)
      await startWatchingProjectTree(rootPath, handle)
      fileSystemEvents.emit({ type: 'directory:modified', path: rootPath })
      return
    }

    const templateRoot = AbsPath.join(projectPath, RelPath.from('game/template'))

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
    const parentGameDir = AbsPath.join(projectPath, RelPath.from('game'))
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

  function createFileSystemItemFromVfsEntry(entry: VfsDirEntry, parentPath: AbsPath, parentId: string | undefined): FileSystemItem {
    const path = AbsPath.append(parentPath, entry.name)
    const id = getOrCreateItemId(path)
    const metadata = {
      size: entry.size,
      modifiedAt: entry.modifiedAt,
      createdAt: entry.createdAt,
    }

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
        ...metadata,
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
      ...metadata,
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
    const loadGeneration = initializationGeneration
    parent.loadingRevision = loadRevision
    const loadPromise = (async () => {
      try {
        const context = requireVfsContext()
        const entries = await vfsCmds.listDir({
          projectPath: context.projectPath,
          enginePath: context.enginePath,
          relPath: requireProjectRelativePath(path),
          templatePath: context.templatePath,
        })

        // 结果只在启动它的那一代工作区里落地：工作区切换或父目录重载后，
        // 迟到的列举结果不得写回文件树（否则会往已清空的视图里塞上一个工程的条目）
        if (parent.loadRevision !== loadRevision || loadGeneration !== initializationGeneration) {
          return
        }

        const resolvedItems = entries.map(entry => createFileSystemItemFromVfsEntry(entry, path, parentId))

        for (const item of resolvedItems) {
          items.set(item.id, item)
        }

        parent.childIds = resolvedItems.map(item => item.id)
        parent.isLoaded = true
      } catch (error) {
        if (parent.loadRevision !== loadRevision || loadGeneration !== initializationGeneration) {
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

  /** 项目内相对路径（项目根为空路径）。视图操作只接受项目内路径，越界即失败而不是退化成根路径 */
  function requireProjectRelativePath(path: AbsPath): RelPath {
    const context = requireVfsContext()
    try {
      return AbsPath.relativize(path, context.projectPath)
    } catch {
      throw new AppError('PATH_DENIED', '路径不在当前项目内', { details: { path } })
    }
  }

  async function prepareVfsPasteTarget(
    sourcePath: AbsPath,
    targetPath: AbsPath,
  ): Promise<{
    context: VfsContext
    nextPath: AbsPath
    nextRelPath: RelPath
    relSourcePath: RelPath
  }> {
    const context = requireVfsContext()
    const relSourcePath = requireProjectRelativePath(sourcePath)
    const relTargetDir = requireProjectRelativePath(targetPath)
    if (RelPath.equals(relSourcePath, RelPath.empty())) {
      throw new AppError('PATH_DENIED', '不能复制或移动项目根目录')
    }

    const sourceName = AbsPath.basename(sourcePath)
    const resolvedSourcePath = await vfsCmds.resolvePath({
      projectPath: context.projectPath,
      enginePath: context.enginePath,
      templatePath: context.templatePath,
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
      context,
      nextPath: AbsPath.join(context.projectPath, nextRelPath),
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

  function clear(): InitializationHandle {
    items.clear()
    pathToId.clear()
    clearDirectoryItemsCache()
    enginePath = undefined
    templatePath = undefined
    projectPath = undefined
    const handle = startInitialization()
    if (unwatch) {
      unwatch()
      unwatch = undefined
    }
    return handle
  }

  /** 解析当前游戏的 VFS 上下文；引擎不可用时保持无上下文，由 requireVfsContext 拒绝后续操作 */
  async function applyVfsContext(handle: InitializationHandle): Promise<void> {
    const game = workspaceStore.currentGame
    projectPath = game?.path
    if (!game) {
      enginePath = undefined
      templatePath = undefined
      return
    }

    const site = await gameManager.resolvePreviewSite(game)
    if (!isCurrentInitialization(handle)) {
      return
    }

    enginePath = site.enginePath
    templatePath = site.templatePath
  }

  function projectGameRoot(gamePath: AbsPath): AbsPath {
    return AbsPath.join(gamePath, RelPath.from('game'))
  }

  /** 建立项目文件树：加载 `game/` 根目录并挂上磁盘监听 */
  async function startWatchingProjectTree(rootPath: AbsPath, handle: InitializationHandle): Promise<void> {
    await getFolderContents(rootPath)
    if (!isCurrentInitialization(handle)) {
      // 迟到的树不再挂监听
      return
    }

    const stopWatching = await watchFs(rootPath, handleWatchEvent, { recursive: true, delayMs: WATCH_DELAY_MS })
    if (!isCurrentInitialization(handle)) {
      // 挂载期间工作区已切换：立刻停掉，既不能留在后台继续发事件，也不能写进 unwatch 覆盖新工作区的监听
      stopWatching()
      return
    }

    unwatch = stopWatching
  }

  async function initialize(cwd: AbsPath, handle: InitializationHandle): Promise<void> {
    try {
      await applyVfsContext(handle)
      if (!isCurrentInitialization(handle)) {
        return
      }

      await startWatchingProjectTree(projectGameRoot(cwd), handle)
      handle.resolve()
    } catch (error) {
      handle.resolve()
      if (!isCurrentInitialization(handle)) {
        return
      }

      const msg = error instanceof Error ? error.message : String(error)
      void logger.error(`[FileStore] 初始化工作目录 ${cwd} 文件系统失败: ${msg}`)
      throw new AppError('FS_ERROR', `初始化工作目录 ${cwd} 文件系统失败: ${msg}`)
    }
  }

  // 监听工作区变化
  // 必须同步执行：进入工程时同一次状态变更会同时唤醒编辑器的标签页 watcher，
  // 若 clear()/initialize() 排在 flush 里更晚的位置，先跑到的消费者会读到上一轮
  // 已兑现的 initialized，误以为文件视图已就绪。
  watch(() => workspaceStore.CWD, async (newPath) => {
    const handle = clear()
    if (newPath) {
      await initialize(newPath, handle).catch(() => {
        // initialize 已记录详细错误；这里避免 immediate watcher 产生未处理 Promise，
        // 保持 store 可继续创建，后续工作区切换仍可重新触发初始化。
      })
    } else {
      // 无工作区时不会触发 initialize，立即兑现 initialized，避免外部 await 永久挂起
      handle.resolve()
    }
  }, { immediate: true, flush: 'sync' })

  return $$({
    deleteEntry: async (path: AbsPath, permanent: boolean): Promise<void> => {
      const context = requireVfsContext()
      const relPath = requireProjectRelativePath(path)
      if (RelPath.equals(relPath, RelPath.empty())) {
        throw new AppError('FS_ERROR', '不能通过资源视图删除项目根目录')
      }

      await vfsCmds.deletePath({
        projectPath: context.projectPath,
        enginePath: context.enginePath,
        templatePath: context.templatePath,
        relPath,
        permanent,
      })
      await handleRemoveEvent(path)
    },
    copyEntry: async (sourcePath: AbsPath, targetPath: AbsPath): Promise<AbsPath> => {
      const target = await prepareVfsPasteTarget(sourcePath, targetPath)
      const copiedRelPath = await vfsCmds.copyPath({
        projectPath: target.context.projectPath,
        enginePath: target.context.enginePath,
        templatePath: target.context.templatePath,
        relPath: target.relSourcePath,
        targetRelPath: target.nextRelPath,
      })
      const nextPath = AbsPath.join(target.context.projectPath, copiedRelPath)
      await handleCreateEvent(nextPath, getItemByPath(targetPath)?.id)
      return nextPath
    },
    ensureWritable: async (path: AbsPath): Promise<AbsPath> => {
      const context = requireVfsContext()
      const relPath = requireProjectRelativePath(path)
      if (RelPath.equals(relPath, RelPath.empty())) {
        return path
      }

      return await vfsCmds.ensureWritable({
        projectPath: context.projectPath,
        enginePath: context.enginePath,
        templatePath: context.templatePath,
        relPath,
      })
    },
    getFolderContents,
    initialized,
    updateItemPath,
    applyPathMutation,
    invalidatePathOperationCaches,
    resolveFilePath: async (path: AbsPath): Promise<AbsPath> => {
      const context = requireVfsContext()
      const relPath = requireProjectRelativePath(path)
      if (RelPath.equals(relPath, RelPath.empty())) {
        return path
      }

      return await vfsCmds.resolvePath({
        projectPath: context.projectPath,
        enginePath: context.enginePath,
        templatePath: context.templatePath,
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
