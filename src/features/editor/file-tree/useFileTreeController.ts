import { basename } from '@tauri-apps/api/path'

import {
  getFileTreeNameSelectionEnd,
  getFileTreeParentPath,
  hasFileTreeDuplicateName,
  insertCreatingFileTreeItem,
  resolveFileTreeCreateBlurAction,
  resolveFileTreeCreateStart,
  resolveFileTreeRenameBlurAction,
} from '~/features/editor/file-tree/file-tree'
import { gameFs } from '~/services/game-fs'
import { useEditorUIStateStore } from '~/stores/editor-ui-state'
import { useTabsStore } from '~/stores/tabs'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'
import { createItemComparator } from '~/utils/sort'

import type { FlattenedItem } from 'reka-ui'
import type { FileTreeDefaultFileNameParts } from '~/features/editor/file-tree/file-tree'
import type { FileViewerSortBy, FileViewerSortOrder } from '~/types/file-viewer'
import type { SortableItemAccessor } from '~/utils/sort'

interface ReadonlyRefLike<T = unknown> {
  readonly value: T
}

interface UseFileTreeControllerOptions<T extends object> {
  creatingInputRef: ReadonlyRefLike<unknown>
  defaultExpanded: () => string[]
  defaultFileNameParts?: FileTreeDefaultFileNameParts | (() => FileTreeDefaultFileNameParts)
  defaultFileNamePartsFallback: () => FileTreeDefaultFileNameParts
  defaultFolderName: () => string
  fileTreeContainerRef: ReadonlyRefLike<HTMLElement | null | undefined>
  getKey: (item: T) => string
  inputRef: ReadonlyRefLike<unknown>
  items: () => T[]
  nameField?: keyof T | ((item: T) => string)
  openCreatedFileInTab: () => boolean
  scrollAreaRef: ReadonlyRefLike<unknown>
  sortBy: () => FileViewerSortBy
  sortOrder: () => FileViewerSortOrder
  treeName: () => string | undefined
}

function scheduleFrame(callback: FrameRequestCallback): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(callback)
    return
  }

  setTimeout(() => callback(0), 0)
}

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

  return undefined
}

function resolveViewportElement(source: unknown): HTMLElement | undefined {
  if (typeof source !== 'object' || source === null || !('viewport' in source)) {
    return undefined
  }

  const { viewport } = source as { viewport?: unknown }
  if (typeof viewport !== 'object' || viewport === null || !('viewportElement' in viewport)) {
    return undefined
  }

  const { viewportElement } = viewport as { viewportElement?: unknown }
  return typeof HTMLElement !== 'undefined' && viewportElement instanceof HTMLElement
    ? viewportElement
    : undefined
}

export function useFileTreeController<T extends object>(options: UseFileTreeControllerOptions<T>) {
  function asRecord(item: T): Record<string, unknown> {
    return item as Record<string, unknown>
  }

  function getItemName(item: T): string {
    if (typeof options.nameField === 'function') {
      return options.nameField(item)
    }
    if (options.nameField) {
      return String(asRecord(item)[String(options.nameField)] ?? '')
    }
    return String(asRecord(item).name ?? '')
  }

  function getItemPath(item: T): string {
    return asRecord(item).path as string
  }

  function getItemChildren(item: T): T[] | undefined {
    const { children } = asRecord(item)
    return Array.isArray(children) ? children as T[] : undefined
  }

  function hasItemChildren(item: T): boolean {
    return Array.isArray(asRecord(item).children)
  }

  const treeAccessor: SortableItemAccessor<T> = {
    isDirectory: item => hasItemChildren(item),
    name: item => getItemName(item),
    size: item => asRecord(item).size as number | undefined,
    modifiedAt: item => asRecord(item).modifiedAt as number | undefined,
    createdAt: item => asRecord(item).createdAt as number | undefined,
  }

  function sortItemsRecursively(sourceItems: T[], comparator: (a: T, b: T) => number): T[] {
    return sourceItems.toSorted(comparator).map((item) => {
      const children = getItemChildren(item)
      if (!children || children.length === 0) {
        return item
      }

      return {
        ...item,
        children: sortItemsRecursively(children, comparator),
      }
    })
  }

  const sortedItems = computed(() =>
    sortItemsRecursively(
      options.items(),
      createItemComparator(options.sortBy(), options.sortOrder(), treeAccessor),
    ),
  )

  function getRootPath(): string {
    if (sortedItems.value.length === 0) {
      return ''
    }
    return getFileTreeParentPath(getItemPath(sortedItems.value[0]))
  }

  function checkDuplicateName(parentPath: string, name: string, excludePath?: string): boolean {
    return hasFileTreeDuplicateName(options.items(), {
      getChildren: getItemChildren,
      getName: getItemName,
      getPath: getItemPath,
    }, parentPath, name, excludePath)
  }

  function focusInput(
    inputSource: unknown,
    dataAttr: string,
    selectStart: number,
    selectEnd: number,
  ): void {
    scheduleFrame(() => {
      nextTick(() => {
        const inputEl = resolveInputElement(inputSource)
        if (inputEl) {
          inputEl.focus()
          inputEl.setSelectionRange(selectStart, selectEnd)
          return
        }

        const containerElement = options.fileTreeContainerRef.value
        if (!containerElement) {
          return
        }

        const containerInput = containerElement.querySelector(`[${dataAttr}]`) as HTMLInputElement | null
        if (!containerInput) {
          return
        }

        containerInput.focus()
        containerInput.setSelectionRange(selectStart, selectEnd)
      })
    })
  }

  const renameState = ref({
    itemKey: undefined as string | undefined,
    value: '',
    isStarting: false,
    isInProgress: false,
  })

  const BLUR_CANCEL_DELAY = 50

  function isRenameDuplicate(item: FlattenedItem<T>): boolean {
    const itemPath = getItemPath(item.value)
    const parentPath = getFileTreeParentPath(itemPath)
    return checkDuplicateName(parentPath, renameState.value.value, itemPath)
  }

  function startRenaming(item: FlattenedItem<T>): void {
    const key = options.getKey(item.value)
    renameState.value.itemKey = key
    renameState.value.value = getItemName(item.value)
    renameState.value.isStarting = true

    const selectionEnd = getFileTreeNameSelectionEnd(renameState.value.value, item.hasChildren)

    focusInput(
      options.inputRef.value,
      'data-renaming-input',
      0,
      selectionEnd,
    )

    nextTick(() => {
      renameState.value.isStarting = false
    })
  }

  async function handleRename(item: FlattenedItem<T>): Promise<void> {
    const key = options.getKey(item.value)
    if (
      renameState.value.itemKey !== key
      || renameState.value.isStarting
      || renameState.value.isInProgress
    ) {
      return
    }

    const newName = renameState.value.value.trim()
    const oldName = getItemName(item.value)

    if (!newName || newName === oldName) {
      renameState.value.itemKey = undefined
      return
    }

    if (isRenameDuplicate(item)) {
      return
    }

    renameState.value.isInProgress = true
    try {
      await gameFs.renameFile(getItemPath(item.value), newName)
      renameState.value.itemKey = undefined
    } catch (error) {
      handleError(error)
      renameState.value.value = oldName
    } finally {
      renameState.value.isInProgress = false
    }
  }

  function handleRenameBlur(item: FlattenedItem<T>): void {
    const action = resolveFileTreeRenameBlurAction({
      currentItemKey: options.getKey(item.value),
      currentValue: renameState.value.value,
      isStarting: renameState.value.isStarting,
      originalName: getItemName(item.value),
      renamingItemKey: renameState.value.itemKey,
    })

    if (action === 'noop') {
      return
    }

    if (action === 'cancel') {
      setTimeout(() => {
        if (!renameState.value.isStarting) {
          renameState.value.itemKey = undefined
        }
      }, BLUR_CANCEL_DELAY)
      return
    }

    void handleRename(item)
  }

  function handleCancelRename(): void {
    renameState.value.itemKey = undefined
  }

  function isRenaming(item: FlattenedItem<T>): boolean {
    return renameState.value.itemKey === options.getKey(item.value)
  }

  const CREATE_DELAY = 150
  const CREATING_ITEM_ID_PREFIX = '__creating__'

  const createState = ref({
    parentPath: undefined as string | undefined,
    type: undefined as 'file' | 'folder' | undefined,
    value: '',
    isStarting: false,
    isInProgress: false,
  })

  function isCreateDuplicate(): boolean {
    if (!createState.value.parentPath) {
      return false
    }
    return checkDuplicateName(createState.value.parentPath, createState.value.value)
  }

  function getDefaultFileNameParts(): FileTreeDefaultFileNameParts {
    if (!options.defaultFileNameParts) {
      return options.defaultFileNamePartsFallback()
    }
    return typeof options.defaultFileNameParts === 'function'
      ? options.defaultFileNameParts()
      : options.defaultFileNameParts
  }

  const workspaceStore = useWorkspaceStore()
  const editorUIStateStore = useEditorUIStateStore()
  const tabsStore = useTabsStore()

  const currentGameId = computed(() => workspaceStore.currentGame?.id)

  function resolveExpandedState(): string[] {
    const treeName = options.treeName()
    if (currentGameId.value && treeName) {
      const saved = editorUIStateStore.getFileTreeExpanded(currentGameId.value, treeName)
      return saved.length > 0 ? saved : options.defaultExpanded()
    }
    return options.defaultExpanded()
  }

  const expanded = ref<string[]>(resolveExpandedState())

  function startCreating(parentPath: string, type: 'file' | 'folder'): void {
    createState.value.isStarting = true
    createState.value.parentPath = parentPath
    createState.value.type = type

    const createStart = resolveFileTreeCreateStart({
      accessor: {
        getChildren: getItemChildren,
        getPath: getItemPath,
      },
      defaultFileNameParts: getDefaultFileNameParts(),
      defaultFolderName: options.defaultFolderName(),
      getKey: options.getKey,
      items: options.items(),
      parentPath,
      type,
    })
    createState.value.value = createStart.value

    if (createStart.expandParentKey && !expanded.value.includes(createStart.expandParentKey)) {
      expanded.value = [...expanded.value, createStart.expandParentKey]
    }

    nextTick(() => {
      createState.value.isStarting = false
      focusInput(
        options.creatingInputRef.value,
        'data-creating-input',
        0,
        createStart.selectionEnd,
      )
    })
  }

  async function handleCreate(): Promise<void> {
    if (createState.value.isStarting || createState.value.isInProgress) {
      return
    }

    const fileName = createState.value.value.trim()
    if (!createState.value.parentPath || !createState.value.type || !fileName) {
      cancelCreating()
      return
    }

    if (isCreateDuplicate()) {
      return
    }

    createState.value.isInProgress = true
    try {
      const isFile = createState.value.type === 'file'
      const createdPath = await (isFile
        ? gameFs.createFile(createState.value.parentPath, fileName)
        : gameFs.createFolder(createState.value.parentPath, fileName))

      if (options.openCreatedFileInTab() && isFile && createdPath) {
        const createdName = await basename(createdPath)
        tabsStore.openTab(createdName, createdPath, { forceNormal: true, focus: true })
      }

      cancelCreating()
    } catch (error) {
      handleError(error)
    } finally {
      createState.value.isInProgress = false
    }
  }

  function handleCreateBlur(): void {
    const action = resolveFileTreeCreateBlurAction({
      defaultFileNameParts: getDefaultFileNameParts(),
      defaultFolderName: options.defaultFolderName(),
      isStarting: createState.value.isStarting,
      parentPath: createState.value.parentPath,
      type: createState.value.type,
      value: createState.value.value,
    })

    if (action === 'noop') {
      return
    }

    if (action === 'cancel') {
      setTimeout(() => {
        if (!createState.value.isStarting) {
          cancelCreating()
        }
      }, BLUR_CANCEL_DELAY)
      return
    }

    setTimeout(() => {
      if (!createState.value.isStarting) {
        void handleCreate()
      }
    }, CREATE_DELAY)
  }

  function cancelCreating(): void {
    createState.value.parentPath = undefined
    createState.value.type = undefined
    createState.value.value = ''
  }

  function isCreatingItem(item: FlattenedItem<T>): boolean {
    return item._id.startsWith(CREATING_ITEM_ID_PREFIX)
  }

  function createCreatingItem(
    parentPath: string,
    type: 'file' | 'folder',
    parentLevel: number,
  ): FlattenedItem<T> {
    const creatingId = `${CREATING_ITEM_ID_PREFIX}${parentPath}${type}`
    const isFolder = type === 'folder'
    const creatingValue = {
      path: parentPath,
      name: '',
      __creatingType: type,
      __isCreating: true,
      ...(isFolder ? { children: [] } : {}),
    } as unknown as T

    return {
      _id: creatingId,
      value: creatingValue,
      index: -1,
      level: parentLevel + 1,
      hasChildren: isFolder,
      bind: {
        value: creatingValue,
        level: parentLevel + 1,
        ariaSetsize: 1,
        ariaPosinset: 1,
      },
    } as FlattenedItem<T>
  }

  function processFlattenItems(flattenItems: FlattenedItem<T>[]): FlattenedItem<T>[] {
    return insertCreatingFileTreeItem(flattenItems, {
      creation: createState.value,
      createItem: (parentPath, type, parentLevel) => createCreatingItem(parentPath, type, parentLevel),
      getItemPath,
    })
  }

  function toFileItem(item: FlattenedItem<T>) {
    return {
      path: getItemPath(item.value),
      name: getItemName(item.value),
      isDir: item.hasChildren,
    }
  }

  const itemMap = new Map<string, FlattenedItem<T>>()

  function handleContextMenuRename(fileItem: { path: string }): void {
    const flattenedItem = itemMap.get(fileItem.path)
    if (flattenedItem) {
      startRenaming(flattenedItem)
    }
  }

  function handleContextMenuCreateFile(fileItem: { path: string }): void {
    startCreating(fileItem.path, 'file')
  }

  function handleContextMenuCreateFolder(fileItem: { path: string }): void {
    startCreating(fileItem.path, 'folder')
  }

  function handleEnterKey(item: FlattenedItem<T>): void {
    if (isRenaming(item) && !isRenameDuplicate(item)) {
      void handleRename(item)
    }
  }

  function handleEscapeKey(item: FlattenedItem<T>): void {
    if (isRenaming(item)) {
      handleCancelRename()
    }
  }

  watch(expanded, (newExpanded) => {
    const treeName = options.treeName()
    if (currentGameId.value && treeName) {
      editorUIStateStore.setFileTreeExpanded(currentGameId.value, treeName, newExpanded)
    }
  })

  watch([currentGameId, () => options.treeName()], () => {
    expanded.value = resolveExpandedState()
  }, { immediate: true })

  function collapseAll(): void {
    expanded.value = []
  }

  function getViewportElement(): HTMLElement | undefined {
    return resolveViewportElement(options.scrollAreaRef.value)
  }

  return {
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
    isCreateDuplicate,
    isCreatingItem,
    isRenameDuplicate,
    isRenaming,
    processFlattenItems,
    startCreating,
    toFileItem,
  }
}
