<script setup lang="ts">
import { File, FileImage, FileJson2, FileMusic, FileVideo, FileVolume, Folder } from '@lucide/vue'
import { exists } from '@tauri-apps/plugin-fs'

import { canCreateAssetFile, resolveAssetFileNameParts } from '~/components/editor/asset-file-defaults'
import { useAssetViewItemsLoader } from '~/components/editor/useAssetViewItemsLoader'
import { PopoverAnchor } from '~/components/ui/popover'
import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { usePathOperationFeedback } from '~/composables/usePathOperationFeedback'
import { AbsPath, RelPath } from '~/domain/path'
import { useExternalFileDropImport } from '~/features/editor/external-file-import/useExternalFileDropImport'
import {
  canDropFileTreeTransferItemsToDirectory,
  getFileTreeNameSelectionEnd,
  getFileTreeTransferPayloadItems,
  resolveDroppableFileTreeTransferItems,
  resolveFileTreeDefaultFileDraft,
} from '~/features/editor/file-tree/file-tree'
import { isAnimationTablePath } from '~/services/animation-table-sync'
import { gameFs } from '~/services/game-fs'
import { pathOperation } from '~/services/path-operation'
import { createPathOperationRewriteConfirm } from '~/services/path-operation-confirm'
import { useResourceIndex } from '~/services/resource-index/service'
import { FileSystemItem, useFileStore } from '~/stores/file'
import { usePreferenceStore } from '~/stores/preference'
import { usePreviewSessionStore } from '~/stores/preview-session'
import { useTabsStore } from '~/stores/tabs'
import { useWorkspaceStore } from '~/stores/workspace'
import { FileViewerItem, FileViewerSortBy, FileViewerSortOrder } from '~/types/file-viewer'
import { handleError } from '~/utils/error-handler'

import type { FileSystemEvent } from '~/composables/useFileSystemEvents'
import type { FileTreeTransferItem } from '~/features/editor/file-tree/file-tree'
import type { DragTransferOperation, FileSystemDragPayload } from '~/types/drag-drop'

interface AssetViewProps {
  assetType: string
  searchQuery?: string
  sortBy?: FileViewerSortBy
  sortOrder?: FileViewerSortOrder
}

interface AssetViewEmits {
  'update:sortBy': [sortBy: FileViewerSortBy]
  'update:sortOrder': [sortOrder: FileViewerSortOrder]
}

interface AssetViewExpose {
  createFileInCurrentDirectory: () => Promise<void>
  createFolderInCurrentDirectory: () => Promise<void>
}

const {
  assetType,
  searchQuery = '',
  sortBy = 'name',
  sortOrder = 'asc',
} = defineProps<AssetViewProps>()
const emit = defineEmits<AssetViewEmits>()

let currentPath = $(defineModel<string>('current-path', { required: true }))

const preferenceStore = usePreferenceStore()
const tabsStore = useTabsStore()
const fileStore = useFileStore()
const fileSystemEvents = useFileSystemEvents()
const previewSessionStore = usePreviewSessionStore()
const resourceIndex = useResourceIndex()
const workspaceStore = useWorkspaceStore()
const { t } = useI18n()
const confirmPathOperationRewrite = createPathOperationRewriteConfirm(t)
const pathOperationFeedback = usePathOperationFeedback()

const fileViewerRef = useTemplateRef<InstanceType<typeof FileViewer>>('fileViewerRef')
const externalDropZoneRef = useTemplateRef<HTMLElement>('externalDropZoneRef')
const renameInputRef = useTemplateRef('renameInputRef')

let scrollTop = 0
let lastSelectedPath = $ref('')
let lastSelectedAt = $ref(0)
let renameAnchorElement = $ref<HTMLElement>()
let renameTargetItem = $ref<FileViewerItem>()
let renameValue = $ref('')
let isRenamePopoverOpen = $ref(false)
let isRenameSubmitting = $ref(false)

const DOUBLE_CLICK_THRESHOLD_MS = 260
const CREATE_ITEM_RENAME_POLL_DELAY_MS = 50
const CREATE_ITEM_RENAME_POLL_RETRY_COUNT = 20
const FILE_SYSTEM_REFRESH_EVENT_TYPES = [
  'file:created',
  'file:removed',
  'file:renamed',
  'file:modified',
  'file:written',
  'directory:created',
  'directory:removed',
  'directory:renamed',
  'directory:modified',
] as const satisfies FileSystemEvent['type'][]

function resolveInputElement(source: unknown): HTMLInputElement | undefined {
  if (typeof HTMLInputElement !== 'undefined' && source instanceof HTMLInputElement) {
    return source
  }

  if (Array.isArray(source)) {
    return source
      .map(item => resolveInputElement(item))
      .find((item): item is HTMLInputElement => item instanceof HTMLInputElement)
  }

  if (typeof source === 'object' && source !== null && '$el' in source) {
    const element = (source as { $el?: unknown }).$el
    return typeof HTMLInputElement !== 'undefined' && element instanceof HTMLInputElement
      ? element
      : undefined
  }
}

const onScroll = useDebounceFn((event: Event) => {
  scrollTop = (event.target as HTMLElement).scrollTop
  if (isRenamePopoverOpen && renameAnchorElement && !renameAnchorElement.isConnected) {
    closeRenamePopover()
  }
}, 100)

useEventListener(() => fileViewerRef.value?.viewport, 'scroll', onScroll)

onActivated(() => {
  fileViewerRef.value?.viewport?.scrollTo({ top: scrollTop })
})

function tryRelativize(path: string, root: string): string | undefined {
  try {
    return AbsPath.relativize(AbsPath.from(path), AbsPath.from(root))
  } catch {
    return undefined
  }
}

function isPathWithinDirectory(path: string, directoryPath: string): boolean {
  try {
    const normalizedPath = AbsPath.from(path)
    const normalizedDirectoryPath = AbsPath.from(directoryPath)

    return AbsPath.equals(normalizedPath, normalizedDirectoryPath)
      || tryRelativize(path, directoryPath) !== undefined
  } catch {
    return false
  }
}

const assetBasePath = $computed(() => {
  if (!workspaceStore.currentGame?.path) {
    return ''
  }

  return AbsPath.join(workspaceStore.currentGame.path, RelPath.from(`game/${assetType}`))
})

const currentDirectoryPath = $computed(() => {
  if (!assetBasePath) {
    return ''
  }

  return currentPath ? AbsPath.join(AbsPath.from(assetBasePath), RelPath.from(currentPath)) : assetBasePath
})

const {
  errorMsg: errorMsgRef,
  isLoading: isLoadingRef,
  isRootDirectoryMissing: isRootDirectoryMissingRef,
  items: itemsRef,
  scheduleItemsRefresh,
} = useAssetViewItemsLoader({
  currentDirectoryPath: () => currentDirectoryPath,
  currentPath: () => currentPath,
  rootDirectoryExists: directoryPath => exists(AbsPath.from(directoryPath)),
  loadDirectory: async (directoryPath) => {
    await fileStore.initialized
    return fileStore.getFolderContents(AbsPath.from(directoryPath))
  },
  mapItem: toFileViewerItem,
})

const items = $computed(() => itemsRef.value)

function resolveReferenceCount(item: FileViewerItem): number | undefined {
  if (item.isDir || item.source === 'templateLower' || resourceIndex.status.value !== 'ready') {
    return
  }

  const gamePath = workspaceStore.currentGame?.path
  if (gamePath && isAnimationTablePath(gamePath, AbsPath.from(item.path))) {
    return
  }

  const entry = resourceIndex.resolveByAbsolutePath(AbsPath.from(item.path))
  return entry ? resourceIndex.getReferencesTo(entry.key).length : 0
}

const itemsWithReferenceCounts = $computed(() => {
  // 引用记录的增量更新保持 ready 状态不变，显式订阅 revision 才能刷新当前视图。
  void resourceIndex.revision.value
  return items.map(item => ({
    ...item,
    referenceCount: resolveReferenceCount(item),
  }))
})

const isLoading = $computed(() => isLoadingRef.value)
const errorMsg = $computed(() => errorMsgRef.value)
const isRootDirectoryMissing = $computed(() => isRootDirectoryMissingRef.value)

const filteredItems = $computed(() => {
  const keyword = searchQuery.trim().toLocaleLowerCase()
  if (!keyword) {
    return itemsWithReferenceCounts
  }

  return itemsWithReferenceCounts.filter(item => item.name.toLocaleLowerCase().includes(keyword))
})
const canCreateFileInCurrentDirectory = $computed(() => canCreateAssetFile(assetType))

const currentDirectoryContextMenuItem = $computed(() => {
  const directoryPath = currentDirectoryPath
  if (!directoryPath) {
    return
  }

  const directoryName = currentPath
    ? RelPath.basename(RelPath.from(currentPath))
    : assetType

  return {
    isDir: true,
    name: directoryName,
    path: directoryPath,
    source: fileStore.getItemByPath(AbsPath.from(directoryPath))?.source,
  }
})

const externalFileImport = useExternalFileDropImport({
  dropZone: externalDropZoneRef,
  rootDirectory: () => currentDirectoryPath || undefined,
})

function canDropFileTransferItems(
  items: readonly FileTreeTransferItem[],
  targetDirectory: FileViewerItem,
  operation: DragTransferOperation,
): boolean {
  if (!targetDirectory.isDir) {
    return false
  }

  return canDropFileTreeTransferItemsToDirectory(items, targetDirectory.path, operation)
}

function canDropFileTransfer(
  payload: FileSystemDragPayload,
  targetDirectory: FileViewerItem,
  operation: DragTransferOperation,
): boolean {
  return canDropFileTransferItems(
    getFileTreeTransferPayloadItems(payload),
    targetDirectory,
    operation,
  )
}

function resolveDroppableFileTransferItems(
  payload: FileSystemDragPayload,
  targetDirectory: FileViewerItem,
  operation: DragTransferOperation,
): FileTreeTransferItem[] | undefined {
  if (!targetDirectory.isDir) {
    return
  }

  return resolveDroppableFileTreeTransferItems(payload, targetDirectory.path, operation)
}

async function moveFileTransferItems(
  items: readonly FileTreeTransferItem[],
  targetDirectory: FileViewerItem,
): Promise<void> {
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop -- 多文件移动按用户拖拽顺序串行执行，避免确认框和 path-operation registry 交错。
    const result = await pathOperation.perform({
      kind: 'move',
      sourcePath: AbsPath.from(item.path),
      target: { type: 'directory', directory: AbsPath.from(targetDirectory.path) },
    }, confirmPathOperationRewrite)
    pathOperationFeedback.reportWarnings(result.warnings)
  }
}

async function copyFileTransferItems(
  items: readonly FileTreeTransferItem[],
  targetDirectory: FileViewerItem,
): Promise<void> {
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop -- 多文件复制按用户拖拽顺序串行执行，保持与文件树粘贴入口一致。
    await gameFs.copyFile(AbsPath.from(item.path), AbsPath.from(targetDirectory.path))
  }
}

async function handleFileTransferDrop(
  payload: FileSystemDragPayload,
  targetDirectory: FileViewerItem,
  operation: DragTransferOperation,
): Promise<void> {
  const items = resolveDroppableFileTransferItems(payload, targetDirectory, operation)
  if (!items) {
    return
  }

  try {
    if (operation === 'copy') {
      await copyFileTransferItems(items, targetDirectory)
      return
    }

    await moveFileTransferItems(items, targetDirectory)
  } catch (error) {
    if (operation === 'copy') {
      handleError(error)
      return
    }

    pathOperationFeedback.reportError(error)
  }
}

const renamePopoverAlign = $computed(() =>
  preferenceStore.assetViewMode === 'grid' ? 'center' : 'start',
)
const previewCwd = $computed(() => workspaceStore.currentGame?.path)
const previewBaseUrl = $computed(() => previewSessionStore.currentGameServeUrl)

const isRenameDuplicate = $computed(() => {
  const currentItem = renameTargetItem
  const nextName = renameValue.trim().toLocaleLowerCase()

  if (!currentItem || !nextName) {
    return false
  }

  return items.some(item =>
    item.path !== currentItem.path
    && item.name.trim().toLocaleLowerCase() === nextName,
  )
})

watch([() => currentPath, () => searchQuery], () => {
  fileViewerRef.value?.scrollToIndex(0)
  closeRenamePopover()
})

watch(() => filteredItems.map(item => item.path).join('|'), () => {
  if (isRenamePopoverOpen && renameAnchorElement && !renameAnchorElement.isConnected) {
    closeRenamePopover()
  }
})

function toFileViewerItem(item: FileSystemItem): FileViewerItem {
  return {
    name: item.name,
    path: item.path,
    isDir: item.isDir,
    mimeType: item.isDir ? undefined : item.mimeType,
    size: item.size,
    modifiedAt: item.modifiedAt,
    createdAt: item.createdAt,
    source: item.source,
  }
}

function isFileSystemEventRelevant(event: FileSystemEvent): boolean {
  const directoryPath = currentDirectoryPath
  if (!directoryPath) {
    return false
  }

  if ('path' in event) {
    return isPathWithinDirectory(event.path, directoryPath)
      || (event.type.startsWith('directory:') && isPathWithinDirectory(directoryPath, event.path))
  }

  return isPathWithinDirectory(event.oldPath, directoryPath)
    || isPathWithinDirectory(event.newPath, directoryPath)
    || (event.type.startsWith('directory:') && (
      isPathWithinDirectory(directoryPath, event.oldPath)
      || isPathWithinDirectory(directoryPath, event.newPath)
    ))
}

function getIconComponent(item: FileViewerItem) {
  if (item.isDir) {
    return Folder
  }

  const mimeType = item.mimeType ?? ''
  if (mimeType.startsWith('image/')) {
    return FileImage
  }
  if (mimeType.startsWith('video/')) {
    return FileVideo
  }
  if (mimeType.startsWith('audio/')) {
    return assetType === 'vocal' ? FileVolume : FileMusic
  }
  if (mimeType === 'application/json') {
    return FileJson2
  }

  return File
}

function handleNavigate(item: FileViewerItem): void {
  const basePath = assetBasePath
  if (!basePath) {
    currentPath = ''
    return
  }

  const relativePath = tryRelativize(item.path, basePath)
  if (relativePath === '') {
    currentPath = ''
  } else if (relativePath !== undefined) {
    currentPath = relativePath
  }
}

function handleSelect(item: FileViewerItem): void {
  tabsStore.openTab(item.name, AbsPath.from(item.path))

  const now = Date.now()
  if (item.path === lastSelectedPath && now - lastSelectedAt <= DOUBLE_CLICK_THRESHOLD_MS) {
    const index = tabsStore.findTabIndex(AbsPath.from(item.path))
    const tab = tabsStore.tabs[index]
    if (tab?.isPreview) {
      tabsStore.fixPreviewTab(index)
    }
  }

  lastSelectedPath = item.path
  lastSelectedAt = now
}

function handleAuxClick(item: FileViewerItem): void {
  if (item.isDir) {
    return
  }
  tabsStore.openTab(item.name, AbsPath.from(item.path), { forceNormal: true })
}

function closeRenamePopover(): void {
  isRenamePopoverOpen = false
  isRenameSubmitting = false
  renameAnchorElement = undefined
  renameTargetItem = undefined
  renameValue = ''
}

function findRenameAnchor(path: string): HTMLElement | undefined {
  const viewport = fileViewerRef.value?.viewport
  if (!viewport) {
    return undefined
  }

  const itemElement = [...viewport.querySelectorAll<HTMLElement>('[data-file-viewer-path]')]
    .find(element => element.dataset.fileViewerPath === path)

  return itemElement?.querySelector<HTMLElement>('[data-file-viewer-name]') ?? undefined
}

function getRenameFallbackAnchor(): HTMLElement | undefined {
  return fileViewerRef.value?.viewport
}

function isItemVisibleInCurrentFilter(path: string): boolean {
  return filteredItems.some(item => item.path === path)
}

function isCurrentDirectorySnapshotActive(directoryPathSnapshot: string | undefined): boolean {
  return !!directoryPathSnapshot && currentDirectoryPath === directoryPathSnapshot
}

async function resolveRenameAnchor(
  path: string,
  directoryPathSnapshot?: string,
): Promise<HTMLElement | undefined> {
  if (directoryPathSnapshot && !isCurrentDirectorySnapshotActive(directoryPathSnapshot)) {
    return undefined
  }

  // 项被搜索过滤掉时，没有对应 DOM 行可锚定，仅在此场景退回 viewport，
  // 避免新建后因搜索条件不匹配而完全无法重命名。
  // 注意不要把这条 fallback 用于「项可见但 DOM 锚点未及时出现」的情况：
  // 那会让 Popover 错误地相对整个 viewport 定位，造成位置异常。
  if (!isItemVisibleInCurrentFilter(path)) {
    return getRenameFallbackAnchor()
  }

  return await waitForRenameAnchor(path, directoryPathSnapshot)
}

function normalizeRenameTarget(item: { path: string, name: string, isDir?: boolean }): FileViewerItem {
  return items.find(entry => entry.path === item.path) ?? {
    isDir: item.isDir ?? false,
    name: item.name,
    path: item.path,
  }
}

function hasItemWithName(name: string): boolean {
  const normalizedName = name.trim().toLocaleLowerCase()
  if (!normalizedName) {
    return false
  }

  return items.some(item => item.name.trim().toLocaleLowerCase() === normalizedName)
}

function resolveNextCreatedFolderName(): string {
  const defaultFolderName = t('edit.fileTree.defaultFolderName')
  if (!hasItemWithName(defaultFolderName)) {
    return defaultFolderName
  }

  let suffix = 2
  while (hasItemWithName(`${defaultFolderName} ${suffix}`)) {
    suffix++
  }

  return `${defaultFolderName} ${suffix}`
}

function resolveNextCreatedFileName(): string | undefined {
  const defaultFileStem = t('edit.fileTree.defaultFileStem')
  const initialFileNameParts = resolveAssetFileNameParts(assetType, defaultFileStem)
  if (!initialFileNameParts) {
    return
  }
  const initialDraft = resolveFileTreeDefaultFileDraft(initialFileNameParts)

  if (!hasItemWithName(initialDraft.value)) {
    return initialDraft.value
  }

  let suffix = 2
  while (true) {
    const nextFileNameParts = resolveAssetFileNameParts(assetType, `${defaultFileStem} ${suffix}`)
    if (!nextFileNameParts) {
      return
    }

    const nextDraft = resolveFileTreeDefaultFileDraft(nextFileNameParts)
    if (!hasItemWithName(nextDraft.value)) {
      return nextDraft.value
    }
    suffix++
  }
}

async function waitForCreatedItem(
  path: string,
  directoryPathSnapshot?: string,
  attempt: number = 0,
): Promise<FileViewerItem | undefined> {
  if (directoryPathSnapshot && !isCurrentDirectorySnapshotActive(directoryPathSnapshot)) {
    return undefined
  }

  const targetItem = items.find(item => item.path === path)
  if (targetItem || attempt >= CREATE_ITEM_RENAME_POLL_RETRY_COUNT - 1) {
    return targetItem
  }

  await nextTick()
  await new Promise<void>(resolve => setTimeout(resolve, CREATE_ITEM_RENAME_POLL_DELAY_MS))
  return waitForCreatedItem(path, directoryPathSnapshot, attempt + 1)
}

async function waitForRenameAnchor(
  path: string,
  directoryPathSnapshot?: string,
  attempt: number = 0,
): Promise<HTMLElement | undefined> {
  if (directoryPathSnapshot && !isCurrentDirectorySnapshotActive(directoryPathSnapshot)) {
    return undefined
  }

  const anchorElement = findRenameAnchor(path)
  if (anchorElement || attempt >= CREATE_ITEM_RENAME_POLL_RETRY_COUNT - 1) {
    return anchorElement
  }

  await nextTick()
  await new Promise<void>(resolve => setTimeout(resolve, CREATE_ITEM_RENAME_POLL_DELAY_MS))
  return waitForRenameAnchor(path, directoryPathSnapshot, attempt + 1)
}

async function scrollRenameTargetIntoView(path: string): Promise<void> {
  fileViewerRef.value?.scrollToItemPath(path)
  await nextTick()
}

async function handleContextMenuRename(
  item: { path: string, name: string, isDir?: boolean },
  directoryPathSnapshot?: string,
): Promise<void> {
  if (directoryPathSnapshot && !isCurrentDirectorySnapshotActive(directoryPathSnapshot)) {
    return
  }

  const targetItem = normalizeRenameTarget(item)
  const anchorElement = await resolveRenameAnchor(targetItem.path, directoryPathSnapshot)
  if (directoryPathSnapshot && !isCurrentDirectorySnapshotActive(directoryPathSnapshot)) {
    return
  }
  if (!anchorElement) {
    return
  }

  renameAnchorElement = anchorElement
  renameTargetItem = targetItem
  renameValue = targetItem.name
  isRenamePopoverOpen = true

  await nextTick()

  const inputElement = resolveInputElement(renameInputRef.value)
  if (!inputElement) {
    return
  }

  inputElement.focus()
  inputElement.setSelectionRange(0, getFileTreeNameSelectionEnd(targetItem.name, targetItem.isDir))
}

async function handleContextMenuCreateFolder(item: { path: string, name: string, isDir?: boolean }): Promise<void> {
  const folderName = resolveNextCreatedFolderName()
  await handleContextMenuCreateItem(item, {
    create: gameFs.createFolder,
    isDir: true,
    name: folderName,
  })
}

async function handleContextMenuCreateFile(item: { path: string, name: string, isDir?: boolean }): Promise<void> {
  const fileName = resolveNextCreatedFileName()
  if (!fileName) {
    return
  }

  await handleContextMenuCreateItem(item, {
    create: gameFs.createFile,
    isDir: false,
    name: fileName,
  })
}

async function handleContextMenuCreateItem(
  item: { path: string, name: string, isDir?: boolean },
  options: {
    create: (targetPath: AbsPath, name: string) => Promise<AbsPath>
    isDir: boolean
    name: string
  },
): Promise<void> {
  if (!item.path) {
    return
  }

  const currentDirectorySnapshot = currentDirectoryPath || item.path

  try {
    const createdPath = await options.create(AbsPath.from(item.path), options.name)
    const createdName = AbsPath.basename(AbsPath.from(createdPath))

    scheduleItemsRefresh(true)

    const targetItem = await waitForCreatedItem(createdPath, currentDirectorySnapshot)
    if (!isCurrentDirectorySnapshotActive(currentDirectorySnapshot)) {
      return
    }

    if (targetItem) {
      await scrollRenameTargetIntoView(targetItem.path)
      await handleContextMenuRename(targetItem, currentDirectorySnapshot)
      return
    }

    await handleContextMenuRename({
      isDir: options.isDir,
      name: createdName || options.name,
      path: createdPath,
    }, currentDirectorySnapshot)
  } catch (error) {
    handleError(error)
  }
}

async function createFileInCurrentDirectory(): Promise<void> {
  if (!currentDirectoryContextMenuItem || !canCreateFileInCurrentDirectory) {
    return
  }

  await handleContextMenuCreateFile(currentDirectoryContextMenuItem)
}

async function createFolderInCurrentDirectory(): Promise<void> {
  if (!currentDirectoryContextMenuItem) {
    return
  }

  await handleContextMenuCreateFolder(currentDirectoryContextMenuItem)
}

const assetViewExpose: AssetViewExpose = {
  createFileInCurrentDirectory,
  createFolderInCurrentDirectory,
}

defineExpose(assetViewExpose)

function handleRenamePopoverOpenChange(nextOpen: boolean): void {
  if (!nextOpen) {
    closeRenamePopover()
  }
}

function handleRenameCancel(): void {
  closeRenamePopover()
}

async function handleRenameSubmit(): Promise<void> {
  const item = renameTargetItem
  if (!item || isRenameSubmitting) {
    return
  }

  const nextName = renameValue.trim()
  if (!nextName || nextName === item.name) {
    closeRenamePopover()
    return
  }

  if (isRenameDuplicate) {
    return
  }

  isRenameSubmitting = true

  try {
    const result = await pathOperation.perform({
      kind: 'rename',
      sourcePath: AbsPath.from(item.path),
      target: { type: 'name', name: nextName },
    }, confirmPathOperationRewrite)
    pathOperationFeedback.reportWarnings(result.warnings)
    closeRenamePopover()
  } catch (error) {
    pathOperationFeedback.reportError(error)
    renameValue = item.name
    isRenameSubmitting = false
  }
}

const debouncedRefreshItems = useDebounceFn(() => {
  scheduleItemsRefresh(true)
}, 100)

for (const eventType of FILE_SYSTEM_REFRESH_EVENT_TYPES) {
  fileSystemEvents.on(eventType, (event) => {
    if (!isFileSystemEventRelevant(event)) {
      return
    }

    debouncedRefreshItems()
  })
}
</script>

<template>
  <div ref="externalDropZoneRef" class="h-full">
    <FileViewer
      ref="fileViewerRef"
      :error-msg="errorMsg"
      :can-drop-file-transfer="canDropFileTransfer"
      :drop-target-directory="currentDirectoryContextMenuItem"
      enable-drag-transfer
      :external-drop-target-path="externalFileImport.targetDirectory.value"
      :highlighted-item-path="renameTargetItem?.path"
      :is-loading="isLoading"
      :items="filteredItems"
      :preview-cwd="previewCwd"
      :preview-base-url="previewBaseUrl"
      :sort-by="sortBy"
      :sort-order="sortOrder"
      :view-mode="preferenceStore.assetViewMode"
      :zoom="preferenceStore.assetZoom[0]"
      @navigate="handleNavigate"
      @select="handleSelect"
      @auxclick="handleAuxClick"
      @file-transfer-drop="handleFileTransferDrop"
      @update:sort-by="(value) => emit('update:sortBy', value)"
      @update:sort-order="(value) => emit('update:sortOrder', value)"
    >
      <template #icon="{ item, iconSize }">
        <component
          :is="getIconComponent(item)"
          class="shrink-0"
          :stroke-width="1.25"
          :style="{ width: `${iconSize}px`, height: `${iconSize}px` }"
        />
      </template>
      <template #context-menu="{ item }">
        <FileTreeContextMenuContent
          :item="item"
          :on-rename="handleContextMenuRename"
        />
      </template>
      <template v-if="currentDirectoryContextMenuItem" #background-context-menu>
        <FileTreeContextMenuContent
          :item="currentDirectoryContextMenuItem"
          is-root
          :on-create-file="canCreateFileInCurrentDirectory ? handleContextMenuCreateFile : undefined"
          :on-create-folder="handleContextMenuCreateFolder"
          :reveal-in-explorer-disabled="isRootDirectoryMissing"
        />
      </template>
    </FileViewer>

    <Popover :open="isRenamePopoverOpen" @update:open="handleRenamePopoverOpenChange">
      <PopoverAnchor v-if="renameAnchorElement" :reference="renameAnchorElement" />
      <PopoverContent
        v-if="renameTargetItem"
        :align="renamePopoverAlign"
        class="p-2 max-w-56 w-auto"
        side="bottom"
        @close-auto-focus.prevent
      >
        <Input
          ref="renameInputRef"
          ::="renameValue"
          :class="[
            'h-7 text-xs shadow-none field-sizing-content w-auto max-w-full',
            isRenameDuplicate ? 'text-destructive focus-visible:ring-destructive' : ''
          ]"
          :disabled="isRenameSubmitting"
          @keydown.stop
          @keydown.enter="handleRenameSubmit"
          @keydown.escape="handleRenameCancel"
        />
      </PopoverContent>
    </Popover>
  </div>
</template>
