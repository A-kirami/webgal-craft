<script setup lang="ts" generic="T extends object">
import { LucideFile, LucideFolder, LucideFolderOpen } from '@lucide/vue'

import { useDragSession } from '~/composables/useDragSession'
import { useDragSource } from '~/composables/useDragTransfer'
import { useDroppableRegistry } from '~/composables/useDroppableRegistry'
import { AbsPath } from '~/domain/path'
import { getDiagnosticSeverityTextClass } from '~/features/editor/diagnostics/presentation'
import { normalizeFileTreeTransferItems } from '~/features/editor/file-tree/file-tree'
import { useFileTreeController } from '~/features/editor/file-tree/useFileTreeController'
import { useShortcut } from '~/features/editor/shortcut/useShortcut'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useModalStore } from '~/stores/modal'
import { FileViewerSortBy, FileViewerSortOrder } from '~/types/file-viewer'
import { handleError } from '~/utils/error-handler'

import type { FlattenedItem } from 'reka-ui'
import type { ShallowRef, StyleValue } from 'vue'
import type { DiagnosticSeverity } from '~/features/editor/diagnostics/types'
import type { FileTreeDefaultFileNameParts } from '~/features/editor/file-tree/file-tree'
import type { FileSystemDragPayload } from '~/types/drag-drop'

interface Props {
  items: T[]
  getKey: (item: T) => string
  defaultExpanded?: string[]
  nameField?: keyof T | ((item: T) => string)
  itemBadgeText?: (item: T) => string | undefined
  itemDimmed?: (item: T) => boolean
  itemSeverity?: (item: T) => DiagnosticSeverity | undefined
  enableTooltip?: boolean
  tooltipContent?: (item: FlattenedItem<T>) => string
  enableContextMenu?: boolean
  defaultFileNameParts?: FileTreeDefaultFileNameParts | (() => FileTreeDefaultFileNameParts)
  isLoading?: boolean
  treeName?: string
  openCreatedFileInTab?: boolean
  sortBy?: FileViewerSortBy
  sortOrder?: FileViewerSortOrder
  enableDragTransfer?: boolean
  externalDropTargetPath?: AbsPath
  rootPath?: string
  isPathOperationDisabled?: (path: string) => boolean
}

const {
  items,
  getKey,
  defaultExpanded = [],
  nameField,
  itemBadgeText,
  itemDimmed,
  itemSeverity,
  enableTooltip = false,
  tooltipContent,
  enableContextMenu = true,
  defaultFileNameParts,
  isLoading = false,
  treeName,
  openCreatedFileInTab = false,
  sortBy = 'name',
  sortOrder = 'asc',
  enableDragTransfer = false,
  externalDropTargetPath,
  rootPath,
  isPathOperationDisabled,
} = defineProps<Props>()
const inputRef: Readonly<ShallowRef<unknown>> = useTemplateRef('inputRef')
const creatingInputRef: Readonly<ShallowRef<unknown>> = useTemplateRef('creatingInputRef')
const fileTreeContainerRef = shallowRef<HTMLDivElement>()
const rootDropAreaRef = shallowRef<HTMLElement>()

const emit = defineEmits<{
  click: [item: FlattenedItem<T>]
  dblclick: [item: FlattenedItem<T>]
  auxclick: [item: FlattenedItem<T>]
  createFile: [item: { path: string, name: string, isDir?: boolean }]
  createFolder: [item: { path: string, name: string, isDir?: boolean }]
}>()

const selectedItem = defineModel<T>('selectedItem')
const modalStore = useModalStore()
const dragSession = useDragSession()
const dropRegistry = useDroppableRegistry()

const { t } = useI18n()
const scrollAreaRef: Readonly<ShallowRef<unknown>> = useTemplateRef('scrollAreaRef')
const {
  createState,
  expanded,
  itemMap,
  renameState,
  sortedItems,
  cancelCreating,
  collapseAll,
  getItemName,
  getRootPath,
  getViewportElement,
  handleCancelRename,
  handleContextMenuCreateFile,
  handleContextMenuCreateFolder,
  handleContextMenuRename,
  handleCreate,
  handleCreateBlur,
  handleEnterKey,
  handleEscapeKey,
  handleRename,
  handleRenameBlur,
  handleScroll,
  isCreateDuplicate,
  isCreatingItem,
  isRenameDuplicate,
  isRenaming,
  canDropFileSystemItems,
  copyFileSystemItems,
  expandDirectory,
  moveFileSystemItems,
  processFlattenItems,
  startCreating,
  toFileItem,
} = useFileTreeController<T>({
  creatingInputRef,
  defaultExpanded: () => defaultExpanded,
  defaultFileNameParts,
  defaultFileNamePartsFallback: () => ({
    extension: '.txt',
    stem: t('edit.fileTree.defaultFileStem'),
  }),
  fileTreeContainerRef,
  getKey,
  inputRef,
  items: () => items,
  nameField,
  openCreatedFileInTab: () => openCreatedFileInTab,
  scrollAreaRef,
  sortBy: () => sortBy,
  sortOrder: () => sortOrder,
  treeName: () => treeName,
  isPathOperationDisabled: path => isPathOperationDisabled?.(path) ?? false,
})
const fileTreeViewportRef = computed(() => getViewportElement())

// 暴露创建入口和折叠操作给父组件，便于 toolbar / 快捷键触发
defineExpose({
  startCreating,
  collapseAll,
  getViewportElement,
})

function resolveItemBadgeText(item: T): string | undefined {
  return itemBadgeText?.(item)
}

function resolveItemSeverity(item: T): DiagnosticSeverity | undefined {
  return itemSeverity?.(item)
}

function resolveItemSeverityClass(item: T): string | undefined {
  return getDiagnosticSeverityTextClass(resolveItemSeverity(item))
}

interface FileTreeRenderedItem {
  isDir: boolean
  name: string
  path: string
}

interface FileTreeDragSourceHandlers {
  onClickCapture?: (event: MouseEvent) => void
  onPointerdown?: (event: PointerEvent) => void
}

interface FileTreeCreatingRenderItem {
  item: FlattenedItem<T>
  kind: 'creating'
}

interface FileTreeFileRenderItem {
  ancestorDirectoryPaths: string[]
  dropTarget: FileTreeRenderedItem
  fileItem: FileTreeRenderedItem
  item: FlattenedItem<T>
  kind: 'file'
}

type FileTreeRenderItem = FileTreeCreatingRenderItem | FileTreeFileRenderItem

interface FileTreeDirectoryStackItem {
  fileItem: FileTreeRenderedItem
  level: number
}

const HOVER_EXPAND_DELAY = 800
const DRAG_OVERLAY_OFFSET_X = 6
const DRAG_OVERLAY_OFFSET_Y = 6
const dropTargetElements = new Map<string, HTMLElement>()
let renderedFileTreePaths: string[] = []
let activeDropTargetPath = $ref<string>()
let pendingExpandPath = $ref<string>()
let selectedFileTreePaths = $ref<string[]>([])
let selectionAnchorPath = $ref<string>()
let hoverExpandTimerId: ReturnType<typeof setTimeout> | undefined

const fileDragSource = useDragSource<FileSystemDragPayload>({
  autoScroll: {
    container: fileTreeViewportRef,
    edgeSize: 40,
  },
  getData: getFileSystemDragPayload,
  type: 'file-system-item',
})

const effectiveRootPath = $computed(() => rootPath ?? getRootPath())
const highlightedDropTargetPath = $computed(() => activeDropTargetPath ?? externalDropTargetPath)

const activeFileTreePayload = $computed(() => {
  const state = dragSession.state.value
  if (
    !state.isActive
    || state.mode !== 'transfer'
    || state.payload?.type !== 'file-system-item'
    || state.payload.source !== 'file-tree'
  ) {
    return
  }

  return state.payload
})

const rootFileItem = $computed<FileTreeRenderedItem>(() => ({
  isDir: true,
  name: '',
  path: effectiveRootPath,
}))

const dragPreviewItems = $computed(() => {
  const payload = activeFileTreePayload
  if (!payload) {
    return []
  }

  return payload.items?.length
    ? payload.items
    : [{
        isDir: payload.isDir,
        name: payload.name,
        path: payload.path,
      }]
})

const isMultipleDragPreview = $computed(() => dragPreviewItems.length > 1)
const dragPreviewName = $computed(() => {
  const firstItem = dragPreviewItems[0]
  if (!firstItem) {
    return ''
  }

  return firstItem.name || firstItem.path.split('/').at(-1) || firstItem.path
})

const dragPreviewCountLabel = $computed(() =>
  t('edit.fileTree.dragPreviewCount', { count: dragPreviewItems.length }),
)

const dragOverlayStyle = $computed<StyleValue | undefined>(() => {
  const currentPosition = dragSession.state.value.currentPosition
  if (!activeFileTreePayload || !currentPosition) {
    return
  }

  return {
    transform: `translate3d(${currentPosition.x + DRAG_OVERLAY_OFFSET_X}px, ${currentPosition.y + DRAG_OVERLAY_OFFSET_Y}px, 0)`,
    zIndex: '9999',
  }
})

function resolveHTMLElement(value: unknown): HTMLElement | undefined {
  if (value instanceof HTMLElement) {
    return value
  }

  return value && typeof value === 'object' && '$el' in value && value.$el instanceof HTMLElement ? value.$el : undefined
}

function registerRootDropTargets(): void {
  registerDropTarget('root-container', fileTreeContainerRef.value, rootFileItem)
  registerDropTarget('root-area', rootDropAreaRef.value, rootFileItem)
}

function setFileTreeContainerElement(value: unknown): void {
  const element = resolveHTMLElement(value)
  fileTreeContainerRef.value = element instanceof HTMLDivElement ? element : undefined
  registerRootDropTargets()
}

function setRootDropAreaElement(value: unknown): void {
  rootDropAreaRef.value = resolveHTMLElement(value)
  registerRootDropTargets()
}

function reportFileTreeMoveError(error: unknown): void {
  if (error instanceof Error) {
    handleError(error)
    return
  }

  handleError(new Error(String(error)))
}

function getRenderedFileItem(item: FlattenedItem<T>): FileTreeRenderedItem {
  const fileItem = toFileItem(item)
  itemMap.set(fileItem.path, item)
  return fileItem
}

function getRenderedFileItemByPath(path: string): FileTreeRenderedItem | undefined {
  const item = itemMap.get(path)
  return item ? toFileItem(item) : undefined
}

function getRenderedItems(flattenItems: FlattenedItem<T>[]): FileTreeRenderItem[] {
  const directoryStack: FileTreeDirectoryStackItem[] = []
  const nextRenderedFileTreePaths: string[] = []
  itemMap.clear()

  const renderItems: FileTreeRenderItem[] = processFlattenItems(flattenItems).map((item) => {
    if (isCreatingItem(item)) {
      return {
        item,
        kind: 'creating' as const,
      }
    }

    let currentParent = directoryStack.at(-1)
    while (currentParent && currentParent.level >= item.level) {
      directoryStack.pop()
      currentParent = directoryStack.at(-1)
    }

    const fileItem = getRenderedFileItem(item)
    const ancestorDirectoryPaths = [effectiveRootPath, ...directoryStack.map(entry => entry.fileItem.path)]
    const dropTarget = item.hasChildren
      ? fileItem
      : currentParent?.fileItem ?? rootFileItem

    if (item.hasChildren) {
      directoryStack.push({
        fileItem,
        level: item.level,
      })
    }

    nextRenderedFileTreePaths.push(fileItem.path)

    return {
      ancestorDirectoryPaths,
      dropTarget,
      fileItem,
      item,
      kind: 'file' as const,
    }
  })

  renderedFileTreePaths = nextRenderedFileTreePaths
  return renderItems
}

function toUniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths.filter(path => path.length > 0))]
}

function setSelectedFileTreePaths(paths: readonly string[]): void {
  selectedFileTreePaths = toUniquePaths(paths)
}

function syncSelectedFileTreePaths(path?: string): void {
  if (!path) {
    setSelectedFileTreePaths([])
    selectionAnchorPath = undefined
    return
  }

  if (
    selectedFileTreePaths.length === 1
    && AbsPath.equals(AbsPath.from(selectedFileTreePaths[0]), AbsPath.from(path))
  ) {
    selectionAnchorPath = path
    return
  }

  setSelectedFileTreePaths([path])
  selectionAnchorPath = path
}

function getFileTreePathRange(fromPath: string | undefined, toPath: string): string[] {
  if (!fromPath) {
    return [toPath]
  }

  const fromIndex = renderedFileTreePaths.indexOf(fromPath)
  const toIndex = renderedFileTreePaths.indexOf(toPath)
  if (fromIndex === -1 || toIndex === -1) {
    return [toPath]
  }

  const startIndex = Math.min(fromIndex, toIndex)
  const endIndex = Math.max(fromIndex, toIndex)
  return renderedFileTreePaths.slice(startIndex, endIndex + 1)
}

function isFileTreePathSelected(path: string): boolean {
  return selectedFileTreePaths.includes(path)
}

function getSelectedRenderedFileItems(): FileTreeRenderedItem[] {
  return renderedFileTreePaths
    .filter(path => selectedFileTreePaths.includes(path))
    .map(path => getRenderedFileItemByPath(path))
    .filter((item): item is FileTreeRenderedItem => item !== undefined)
}

function getFileTreeSelectedItems(sourceItem: FileTreeRenderedItem): FileTreeRenderedItem[] {
  if (!isFileTreePathSelected(sourceItem.path) || selectedFileTreePaths.length <= 1) {
    return [sourceItem]
  }

  const selectedItems = getSelectedRenderedFileItems()
  return normalizeFileTreeTransferItems(selectedItems.length > 0 ? selectedItems : [sourceItem])
}

function stopFileTreeSelectionEvent(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()
}

function handleModifiedFileTreeItemSelection(event: MouseEvent, item: FlattenedItem<T>): boolean {
  if (isRenaming(item)) {
    return false
  }

  const fileItem = toFileItem(item)
  const shouldExtendRange = event.shiftKey
  const shouldToggle = event.ctrlKey || event.metaKey
  if (!shouldExtendRange && !shouldToggle) {
    return false
  }

  stopFileTreeSelectionEvent(event)
  if (shouldExtendRange) {
    const rangePaths = getFileTreePathRange(selectionAnchorPath, fileItem.path)
    setSelectedFileTreePaths(shouldToggle
      ? [...selectedFileTreePaths, ...rangePaths]
      : rangePaths)
    return true
  }

  setSelectedFileTreePaths(isFileTreePathSelected(fileItem.path)
    ? selectedFileTreePaths.filter(path => path !== fileItem.path)
    : [...selectedFileTreePaths, fileItem.path])
  selectionAnchorPath = fileItem.path
  return true
}

function handleFileTreeItemClickCapture(event: MouseEvent, item: FlattenedItem<T>): void {
  handleModifiedFileTreeItemSelection(event, item)
}

function handleFileTreeItemPointerDown(event: PointerEvent, item: FlattenedItem<T>): void {
  if (
    event.button !== 0
    || event.ctrlKey
    || event.metaKey
    || event.shiftKey
    || isRenaming(item)
  ) {
    return
  }

  const fileItem = toFileItem(item)
  if (!isFileTreePathSelected(fileItem.path)) {
    setSelectedFileTreePaths([fileItem.path])
    selectionAnchorPath = fileItem.path
  }
}

function handleFileTreeItemClick(event: MouseEvent, item: FlattenedItem<T>): void {
  if (handleModifiedFileTreeItemSelection(event, item) || isRenaming(item)) {
    return
  }

  const fileItem = toFileItem(item)
  setSelectedFileTreePaths([fileItem.path])
  selectionAnchorPath = fileItem.path
  emit('click', item)
}

watch(() => {
  const currentSelectedItem = selectedItem.value as Record<string, unknown> | undefined
  return typeof currentSelectedItem?.path === 'string' ? currentSelectedItem.path : undefined
}, syncSelectedFileTreePaths, { immediate: true })

function getFileSystemDragPayload(element: HTMLElement): FileSystemDragPayload {
  const path = element.dataset.fileTreePath ?? ''
  const fileItem = getRenderedFileItemByPath(path)
    ?? {
      isDir: element.dataset.fileTreeIsDir === 'true',
      name: element.dataset.fileTreeName ?? '',
      path,
    }
  const dragItems = getFileTreeSelectedItems(fileItem)

  return {
    isDir: fileItem.isDir,
    items: dragItems.map(item => ({
      isDir: item.isDir,
      name: item.name,
      path: item.path,
    })),
    name: fileItem.name,
    path: fileItem.path,
    source: 'file-tree',
    type: 'file-system-item',
  }
}

function clearHoverExpandTimer(path?: string): void {
  if (path && pendingExpandPath !== path) {
    return
  }

  if (hoverExpandTimerId !== undefined) {
    clearTimeout(hoverExpandTimerId)
    hoverExpandTimerId = undefined
  }
  pendingExpandPath = undefined
}

function scheduleHoverExpand(path: string): void {
  clearHoverExpandTimer()
  pendingExpandPath = path
  hoverExpandTimerId = setTimeout(() => {
    if (pendingExpandPath === path) {
      expandDirectory(path)
    }
    clearHoverExpandTimer(path)
  }, HOVER_EXPAND_DELAY)
}

function isDropAllowed(payload: FileSystemDragPayload, fileItem: Pick<FileTreeRenderedItem, 'isDir' | 'path'>): boolean {
  if (!fileItem.isDir) {
    return false
  }

  return canDropFileSystemItems(payload, fileItem.path, dragSession.state.value.transferOperation)
}

function handleDragEnter(payload: FileSystemDragPayload, fileItem: Pick<FileTreeRenderedItem, 'isDir' | 'path'>): void {
  if (!isDropAllowed(payload, fileItem)) {
    return
  }

  activeDropTargetPath = fileItem.path
  if (fileItem.path !== effectiveRootPath) {
    scheduleHoverExpand(fileItem.path)
  }
}

function handleDragLeave(_payload: FileSystemDragPayload, fileItem: Pick<FileTreeRenderedItem, 'path'>): void {
  if (activeDropTargetPath === fileItem.path) {
    activeDropTargetPath = undefined
  }
  clearHoverExpandTimer(fileItem.path)
}

async function handleDrop(payload: FileSystemDragPayload, fileItem: Pick<FileTreeRenderedItem, 'isDir' | 'path'>): Promise<void> {
  clearHoverExpandTimer(fileItem.path)
  if (!isDropAllowed(payload, fileItem)) {
    return
  }

  try {
    const operation = dragSession.state.value.transferOperation
    await (operation === 'copy' ? copyFileSystemItems(payload, fileItem.path) : moveFileSystemItems(payload, fileItem.path))
  } catch (error) {
    reportFileTreeMoveError(error)
  } finally {
    if (activeDropTargetPath === fileItem.path) {
      activeDropTargetPath = undefined
    }
  }
}

function registerDropTarget(
  key: string,
  element: HTMLElement | undefined,
  fileItem: Pick<FileTreeRenderedItem, 'isDir' | 'name' | 'path'>,
): void {
  const previousElement = dropTargetElements.get(key)
  if (previousElement && previousElement !== element) {
    dropRegistry.unregisterDroppable(previousElement)
    dropTargetElements.delete(key)
  }

  if (!enableDragTransfer || !element || !fileItem.path) {
    if (previousElement !== undefined && previousElement === element) {
      dropRegistry.unregisterDroppable(previousElement)
      dropTargetElements.delete(key)
    }
    return
  }

  dropTargetElements.set(key, element)
  dropRegistry.registerDroppable(element, {
    accept: 'file-system-item',
    canDrop: payload => isDropAllowed(payload as FileSystemDragPayload, fileItem),
    id: `file-tree:${key}`,
    onDragEnter: payload => handleDragEnter(payload as FileSystemDragPayload, fileItem),
    onDragLeave: payload => handleDragLeave(payload as FileSystemDragPayload, fileItem),
    onDrop: payload => handleDrop(payload as FileSystemDragPayload, fileItem),
  })
}

function setFileTreeItemElement(
  value: unknown,
  renderItem: FileTreeFileRenderItem,
): void {
  registerDropTarget(renderItem.fileItem.path, resolveHTMLElement(value), renderItem.dropTarget)
}

function getFileTreeDragSourceProps(item: FlattenedItem<T>) {
  return enableDragTransfer && !isRenaming(item)
    ? fileDragSource.sourceProps()
    : {} as FileTreeDragSourceHandlers
}

function isOperationDisabledForPath(path: string): boolean {
  return isPathOperationDisabled?.(path) ?? false
}

function isOperationDisabledForSelection(path: string): boolean {
  return isOperationDisabledForPath(path)
    || selectedFileTreePaths.some(selectedPath => isOperationDisabledForPath(selectedPath))
}

function getFileTreeItemBind(item: FlattenedItem<T>) {
  const dragSourceProps = getFileTreeDragSourceProps(item)

  return {
    ...item.bind,
    ...dragSourceProps,
    onClickCapture: (event: MouseEvent) => {
      dragSourceProps.onClickCapture?.(event)
      if (!event.defaultPrevented) {
        handleFileTreeItemClickCapture(event, item)
      }
    },
    onPointerdown: (event: PointerEvent) => {
      handleFileTreeItemPointerDown(event, item)
      dragSourceProps.onPointerdown?.(event)
    },
  }
}

function isFileTreeDropRangeActive(renderItem: FileTreeFileRenderItem): boolean {
  return Boolean(
    highlightedDropTargetPath !== undefined
    && (
      highlightedDropTargetPath === renderItem.fileItem.path
      || renderItem.ancestorDirectoryPaths.includes(highlightedDropTargetPath)
    ),
  )
}

function getFileTreeDropTargetClass(renderItem: FileTreeFileRenderItem): string {
  if (!isFileTreeDropRangeActive(renderItem)) {
    return ''
  }

  return highlightedDropTargetPath === renderItem.fileItem.path
    ? 'bg-accent outline outline-1 outline-primary/50'
    : 'bg-accent/60'
}

const isRootDropTargetActive = $computed(() =>
  highlightedDropTargetPath === effectiveRootPath,
)

function isItemDimmed(item: T): boolean {
  return itemDimmed?.(item) ?? false
}

function toSelectedFileItem() {
  const currentSelectedItem = selectedItem.value as Record<string, unknown> | undefined
  if (!currentSelectedItem || typeof currentSelectedItem.path !== 'string') {
    return
  }

  return {
    isDir: Array.isArray(currentSelectedItem.children),
    name: getItemName(selectedItem.value as T),
    path: currentSelectedItem.path,
  }
}

function toFocusedFileItem() {
  if (typeof document === 'undefined') {
    return
  }

  const activeElement = document.activeElement
  if (!(activeElement instanceof HTMLElement) || !fileTreeContainerRef.value?.contains(activeElement)) {
    return
  }

  const treeItemElement = activeElement.closest<HTMLElement>('[data-file-tree-path]')
  const itemPath = treeItemElement?.dataset.fileTreePath
  if (!itemPath) {
    return
  }

  const focusedItem = itemMap.get(itemPath)
  return focusedItem ? toFileItem(focusedItem) : undefined
}

function toShortcutTargetFileItem() {
  return toFocusedFileItem() ?? toSelectedFileItem()
}

function handleShortcutRename() {
  if (!enableContextMenu) {
    return
  }

  const fileItem = toShortcutTargetFileItem()
  if (!fileItem || isOperationDisabledForSelection(fileItem.path)) {
    return
  }

  handleContextMenuRename(fileItem)
}

function handleShortcutDelete() {
  if (!enableContextMenu) {
    return
  }

  const fileItem = toShortcutTargetFileItem()
  if (!fileItem || isOperationDisabledForSelection(fileItem.path)) {
    return
  }

  modalStore.open('DeleteFileModal', {
    file: fileItem,
  })
}

useShortcutContext({
  panelFocus: 'fileTree',
}, {
  target: fileTreeContainerRef,
  trackFocus: true,
})

useShortcut(() => ({
  execute: handleShortcutRename,
  i18nKey: 'shortcut.fileTree.rename',
  id: 'fileTree.rename',
  keys: enableContextMenu ? 'F2' : '',
  when: { panelFocus: 'fileTree' },
}))

useShortcut(() => ({
  execute: handleShortcutDelete,
  i18nKey: 'shortcut.fileTree.delete',
  id: 'fileTree.delete',
  keys: enableContextMenu ? 'Delete' : '',
  when: { panelFocus: 'fileTree' },
}))

watch(() => effectiveRootPath, () => {
  registerRootDropTargets()
})

tryOnUnmounted(() => {
  clearHoverExpandTimer()
  for (const element of dropTargetElements.values()) {
    dropRegistry.unregisterDroppable(element)
  }
  dropTargetElements.clear()
})
</script>

<template>
  <ScrollArea ref="scrollAreaRef" class="flex-scroll-area h-full" @scroll="handleScroll">
    <!-- 加载状态提示 -->
    <div v-if="isLoading" role="status" :aria-label="$t('common.loading')" class="flex h-full items-center justify-center">
      <div class="text-muted-foreground flex flex-col gap-3 items-center">
        <div class="border-2 border-current border-t-transparent rounded-full size-5 animate-spin" />
      </div>
    </div>

    <!-- 文件树内容 -->
    <Tree
      v-else
      v-slot="{ flattenItems: flattenItemsSlot }"
      v-model="selectedItem"
      ::expanded="expanded"
      :items="sortedItems"
      :get-key="getKey"
      selection-behavior="replace"
      class="text-13px h-full min-h-0"
    >
      <TooltipProvider :skip-delay-duration="0" :ignore-non-keyboard-focus="true">
        <div
          :ref="setFileTreeContainerElement"
          data-file-tree-root-surface="true"
          :class="[
            'relative shrink-0',
            isRootDropTargetActive ? 'bg-accent/35' : '',
          ]"
        >
          <template
            v-for="renderItem in getRenderedItems(flattenItemsSlot)"
            :key="renderItem.item._id"
          >
            <!-- 创建项的特殊渲染 -->
            <template v-if="renderItem.kind === 'creating'">
              <TreeItem
                v-bind="renderItem.item.bind"
                :level="renderItem.item.level"
                :has-children="createState.type === 'folder'"
              >
                <TreeItemLabel :has-children="createState.type === 'folder'">
                  <span class="text-13px flex flex-1 gap-2 min-w-0 w-full items-center">
                    <LucideFile
                      v-if="createState.type === 'file'"
                      class="text-muted-foreground size-4 pointer-events-none"
                    />
                    <LucideFolder
                      v-else-if="createState.type === 'folder'"
                      class="text-muted-foreground size-4 pointer-events-none"
                    />
                    <Input
                      ref="creatingInputRef"
                      ::="createState.value"
                      :class="['px-0 py-0 h-5 text-13px!', isCreateDuplicate() ? 'text-destructive focus-visible:ring-destructive' : '']"
                      data-creating-input
                      autofocus
                      @blur="handleCreateBlur"
                      @keydown.stop
                      @keydown.enter="handleCreate"
                      @keydown.escape="cancelCreating"
                    />
                  </span>
                </TreeItemLabel>
              </TreeItem>
            </template>
            <!-- 正常项的渲染 -->
            <FileTreeContextMenu
              v-else
              :item="renderItem.fileItem"
              :selected-items="getFileTreeSelectedItems(renderItem.fileItem)"
              :on-rename="handleContextMenuRename"
              :on-create-file="handleContextMenuCreateFile"
              :on-create-folder="handleContextMenuCreateFolder"
              :operation-disabled="isOperationDisabledForSelection(renderItem.fileItem.path)"
              :disabled="!enableContextMenu"
            >
              <TreeItem
                v-slot="{ isExpanded }"
                v-bind="getFileTreeItemBind(renderItem.item)"
                :ref="(value) => setFileTreeItemElement(value, renderItem)"
                :level="renderItem.item.level"
                :has-children="renderItem.item.hasChildren"
                :data-file-tree-path="renderItem.fileItem.path"
                :data-file-tree-drop-target-path="renderItem.dropTarget.path"
                :data-file-tree-is-dir="renderItem.fileItem.isDir ? 'true' : 'false'"
                :data-file-tree-name="renderItem.fileItem.name"
                :data-file-tree-selected="isFileTreePathSelected(renderItem.fileItem.path) ? 'true' : undefined"
                :class="[
                  'cursor-pointer touch-none',
                  isFileTreePathSelected(renderItem.fileItem.path) ? 'bg-accent' : '',
                  getFileTreeDropTargetClass(renderItem),
                ]"
                @keydown.enter.prevent="handleEnterKey(renderItem.item)"
                @keydown.escape.prevent="handleEscapeKey(renderItem.item)"
                @click="(event: MouseEvent) => handleFileTreeItemClick(event, renderItem.item)"
                @dblclick="emit('dblclick', renderItem.item)"
                @auxclick="(e: MouseEvent) => e.button === 1 && emit('auxclick', renderItem.item)"
              >
                <Tooltip :disabled="!enableTooltip">
                  <TooltipTrigger as-child>
                    <TreeItemLabel :has-children="renderItem.item.hasChildren">
                      <span
                        class="text-13px flex flex-1 gap-2 min-w-0 w-full items-center"
                      >
                        <template v-if="renderItem.item.hasChildren">
                          <LucideFolderOpen
                            v-if="isExpanded"
                            class="text-muted-foreground size-4 pointer-events-none"
                          />
                          <LucideFolder
                            v-else
                            class="text-muted-foreground size-4 pointer-events-none"
                          />
                        </template>
                        <LucideFile
                          v-else
                          class="text-muted-foreground size-4 pointer-events-none"
                        />
                        <template v-if="isRenaming(renderItem.item)">
                          <Input
                            ref="inputRef"
                            v-model="renameState.value"
                            :class="['px-0 py-0 h-5 text-13px!', isRenameDuplicate(renderItem.item) ? 'text-destructive focus-visible:ring-destructive' : '']"
                            data-renaming-input
                            :disabled="renameState.isInProgress"
                            autofocus
                            @blur="handleRenameBlur(renderItem.item)"
                            @keydown.stop
                            @keydown.enter="handleRename(renderItem.item)"
                            @keydown.escape="handleCancelRename"
                          />
                        </template>
                        <div
                          v-else
                          :class="[
                            'flex flex-1 min-w-0 items-center gap-2',
                            isItemDimmed(renderItem.item.value) ? 'opacity-70' : '',
                          ]"
                        >
                          <div
                            class="whitespace-nowrap text-ellipsis overflow-hidden"
                            :class="resolveItemSeverityClass(renderItem.item.value)"
                            :data-diagnostic-severity="resolveItemSeverity(renderItem.item.value)"
                          >
                            {{ getItemName(renderItem.item.value) }}
                          </div>
                          <span
                            v-if="resolveItemBadgeText(renderItem.item.value)"
                            class="text-[10px] text-muted-foreground leading-none px-1.5 py-0.75 rounded bg-muted shrink-0"
                          >
                            {{ resolveItemBadgeText(renderItem.item.value) }}
                          </span>
                        </div>
                      </span>
                    </TreeItemLabel>
                  </TooltipTrigger>
                  <TooltipContent
                    v-if="tooltipContent"
                    :disabled-portal="true"
                  >
                    <p>{{ tooltipContent(renderItem.item) }}</p>
                  </TooltipContent>
                </Tooltip>
              </TreeItem>
            </FileTreeContextMenu>
          </template>
        </div>
      </TooltipProvider>
      <!-- 根目录空白区：内容不足一屏时填满剩余空间，内容溢出时保留一行可操作区域。 -->
      <FileTreeContextMenu
        v-if="enableContextMenu"
        :item="{ path: effectiveRootPath, name: '', isDir: true }"
        :on-create-file="handleContextMenuCreateFile"
        :on-create-folder="handleContextMenuCreateFolder"
        is-root
        :disabled="false"
      >
        <div
          :ref="setRootDropAreaElement"
          data-file-tree-root-surface="true"
          :class="[
            'flex-1 min-h-[26px]',
            isRootDropTargetActive ? 'bg-accent/60' : '',
          ]"
        />
      </FileTreeContextMenu>
    </Tree>
  </ScrollArea>

  <DragOverlay :visible="activeFileTreePayload !== undefined" :overlay-style="dragOverlayStyle">
    <div class="text-popover-foreground px-2 py-1.5 border border-border/70 rounded bg-popover flex gap-2 max-w-72 min-w-36 shadow-lg items-center" data-testid="file-tree-drag-preview">
      <div class="shrink-0 size-5 relative">
        <LucideFile
          class="text-muted-foreground size-4 absolute"
          :class="isMultipleDragPreview ? 'left-1 top-0.5' : 'left-0.5 top-0.5'"
        />
        <LucideFile
          v-if="isMultipleDragPreview"
          class="text-muted-foreground bg-popover size-4 left-0 top-0 absolute"
        />
      </div>
      <div class="flex gap-2 min-w-0 items-center">
        <span class="text-xs min-w-0 truncate">
          {{ dragPreviewName }}
        </span>
        <span
          v-if="isMultipleDragPreview"
          class="text-[10px] text-muted-foreground leading-none px-1.5 py-0.5 rounded-sm bg-muted shrink-0"
        >
          {{ dragPreviewCountLabel }}
        </span>
      </div>
    </div>
  </DragOverlay>
</template>
