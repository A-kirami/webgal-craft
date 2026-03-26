export interface FileTreeItemAccessor<T> {
  getChildren: (item: T) => T[] | undefined
  getName: (item: T) => string
  getPath: (item: T) => string
}

export interface FileTreeFlattenedItemLike<T> {
  hasChildren: boolean
  level: number
  value: T
}

export interface FileTreeCreatingState {
  parentPath?: string
  type?: 'file' | 'folder'
}

export type FileTreeBlurAction = 'cancel' | 'noop' | 'submit'

export interface ResolveFileTreeRenameBlurActionOptions {
  currentItemKey: string
  currentValue: string
  isStarting: boolean
  originalName: string
  renamingItemKey?: string
}

export interface ResolveFileTreeCreateStartOptions<T> {
  accessor: Pick<FileTreeItemAccessor<T>, 'getChildren' | 'getPath'>
  defaultFileName: string
  defaultFolderName: string
  getKey: (item: T) => string
  hasCustomFileName: boolean
  items: T[]
  parentPath: string
  type: 'file' | 'folder'
}

export interface FileTreeCreateStartResult {
  expandParentKey?: string
  selectionEnd: number
  value: string
}

export interface ResolveFileTreeCreateBlurActionOptions {
  defaultFileName: string
  defaultFolderName: string
  isStarting: boolean
  parentPath?: string
  type?: 'file' | 'folder'
  value: string
}

export function getFileTreeParentPath(path: string): string {
  return path.replace(/[\\/][^\\/]+$/, '')
}

export function getFileTreeNameSelectionEnd(fileName: string, isFolder: boolean): number {
  if (isFolder) {
    return fileName.length
  }

  const lastDotIndex = fileName.lastIndexOf('.')
  return lastDotIndex > 0 ? lastDotIndex : fileName.length
}

export function resolveFileTreeRenameBlurAction(
  options: ResolveFileTreeRenameBlurActionOptions,
): FileTreeBlurAction {
  if (options.isStarting || options.renamingItemKey !== options.currentItemKey) {
    return 'noop'
  }

  const trimmedValue = options.currentValue.trim()
  if (!trimmedValue || trimmedValue === options.originalName) {
    return 'cancel'
  }

  return 'submit'
}

export function findFileTreeItemByPath<T>(
  items: T[],
  targetPath: string,
  accessor: Pick<FileTreeItemAccessor<T>, 'getChildren' | 'getPath'>,
): T | undefined {
  for (const item of items) {
    if (accessor.getPath(item) === targetPath) {
      return item
    }

    const children = accessor.getChildren(item)
    if (!children) {
      continue
    }

    const found = findFileTreeItemByPath(children, targetPath, accessor)
    if (found) {
      return found
    }
  }

  return undefined
}

export function resolveFileTreeCreateStart<T>(
  options: ResolveFileTreeCreateStartOptions<T>,
): FileTreeCreateStartResult {
  const value = options.type === 'file'
    ? options.defaultFileName
    : options.defaultFolderName
  const selectionEnd = options.type === 'file' && options.hasCustomFileName
    ? 0
    : value.length

  const parentItem = findFileTreeItemByPath(options.items, options.parentPath, options.accessor)

  return {
    ...(parentItem ? { expandParentKey: options.getKey(parentItem) } : {}),
    selectionEnd,
    value,
  }
}

export function resolveFileTreeCreateBlurAction(
  options: ResolveFileTreeCreateBlurActionOptions,
): FileTreeBlurAction {
  if (options.isStarting || !options.parentPath || !options.type) {
    return 'noop'
  }

  const trimmedValue = options.value.trim()
  const defaultName = options.type === 'file'
    ? options.defaultFileName
    : options.defaultFolderName

  if (!trimmedValue || trimmedValue === defaultName) {
    return 'cancel'
  }

  return 'submit'
}

function findChildrenInParent<T>(
  items: T[],
  targetParentPath: string,
  accessor: FileTreeItemAccessor<T>,
): T[] {
  for (const item of items) {
    if (accessor.getPath(item) === targetParentPath) {
      return accessor.getChildren(item) ?? []
    }

    const children = accessor.getChildren(item)
    if (children) {
      const found = findChildrenInParent(children, targetParentPath, accessor)
      if (found.length > 0) {
        return found
      }
    }
  }

  return []
}

function getSiblingItems<T>(
  items: T[],
  parentPath: string,
  accessor: FileTreeItemAccessor<T>,
): T[] {
  if (items.length === 0) {
    return []
  }

  const firstItemParentPath = getFileTreeParentPath(accessor.getPath(items[0]))
  return firstItemParentPath === parentPath
    ? items
    : findChildrenInParent(items, parentPath, accessor)
}

export function hasFileTreeDuplicateName<T>(
  items: T[],
  accessor: FileTreeItemAccessor<T>,
  parentPath: string,
  name: string,
  excludePath?: string,
): boolean {
  if (!name.trim()) {
    return false
  }

  const siblings = getSiblingItems(items, parentPath, accessor)
  const trimmedName = name.trim().toLowerCase()

  return siblings.some((sibling) => {
    const siblingPath = accessor.getPath(sibling)
    if (excludePath && siblingPath === excludePath) {
      return false
    }

    return accessor.getName(sibling).trim().toLowerCase() === trimmedName
  })
}

export function insertCreatingFileTreeItem<T, TFlattened extends FileTreeFlattenedItemLike<T>>(
  flattenItems: TFlattened[],
  options: {
    creation: FileTreeCreatingState
    createItem: (parentPath: string, type: 'file' | 'folder', parentLevel: number) => TFlattened
    getItemPath: (item: T) => string
  },
): TFlattened[] {
  const { parentPath, type } = options.creation
  if (!parentPath || !type) {
    return flattenItems
  }

  const result = [...flattenItems]
  const parentIndex = result.findIndex(item =>
    options.getItemPath(item.value) === parentPath,
  )

  if (parentIndex === -1) {
    const rootLevel = result.length > 0 ? result[0].level : 0
    const targetLevel = rootLevel

    let insertIndex = 0
    if (type === 'file') {
      insertIndex = result.findIndex(item =>
        item.level === targetLevel && !item.hasChildren,
      )
      if (insertIndex === -1) {
        insertIndex = result.length
      }
    }

    result.splice(insertIndex, 0, options.createItem(parentPath, type, rootLevel - 1))
    return result
  }

  const parent = result[parentIndex]
  const childLevel = parent.level + 1
  const childrenStartIndex = parentIndex + 1
  let childrenEndIndex = childrenStartIndex

  for (let index = childrenStartIndex; index < result.length; index++) {
    if (result[index].level <= parent.level) {
      break
    }
    childrenEndIndex = index + 1
  }

  let insertIndex: number
  if (type === 'folder') {
    insertIndex = childrenStartIndex
  } else {
    insertIndex = childrenEndIndex
    for (let index = childrenStartIndex; index < childrenEndIndex; index++) {
      if (result[index].level === childLevel && !result[index].hasChildren) {
        insertIndex = index
        break
      }
    }
  }

  result.splice(insertIndex, 0, options.createItem(parentPath, type, parent.level))
  return result
}
