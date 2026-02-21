import type { FileViewerSortOrder } from '~/types/file-viewer'

/**
 * 将可能无效的数值标准化为 number | undefined
 * 非有限数值统一返回 undefined，便于排序时统一处理缺失值
 */
export function normalizeNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * 比较两个可选数值，缺失值始终排在末尾
 */
export function compareOptionalNumber(
  a: number | undefined,
  b: number | undefined,
  sortOrder: FileViewerSortOrder,
): number {
  if (a === undefined || b === undefined) {
    if (a === undefined && b === undefined) {
      return 0
    }
    return a === undefined ? 1 : -1
  }
  if (a === b) {
    return 0
  }
  return sortOrder === 'asc' ? a - b : b - a
}

/**
 * 判断值是否为有效的非负有限数值（适用于文件大小、时间戳等）
 */
export function isValidPositiveNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/**
 * 可排序项的数据访问器
 * 通过抽象数据访问，使排序算法可复用于不同数据结构（FileViewerItem、泛型树节点等）
 */
export interface SortableItemAccessor<T> {
  isDirectory: (item: T) => boolean
  name: (item: T) => string
  size: (item: T) => number | undefined
  modifiedAt: (item: T) => number | undefined
  createdAt: (item: T) => number | undefined
}

/**
 * 创建通用排序比较器
 * 排序规则：目录优先 → 按字段比较（缺失值末尾）→ name 回退保证稳定序
 */
export function createItemComparator<T>(
  sortBy: FileViewerSortBy,
  sortOrder: FileViewerSortOrder,
  accessor: SortableItemAccessor<T>,
): (a: T, b: T) => number {
  function getNumericValue(item: T): number | undefined {
    if (sortBy === 'size') {
      return accessor.isDirectory(item) ? undefined : normalizeNumber(accessor.size(item))
    }
    if (sortBy === 'modifiedTime') {
      return normalizeNumber(accessor.modifiedAt(item))
    }
    if (sortBy === 'createdTime') {
      return normalizeNumber(accessor.createdAt(item))
    }
    return undefined
  }

  function compareByName(a: T, b: T): number {
    return accessor.name(a).localeCompare(accessor.name(b), undefined, { numeric: true, sensitivity: 'base' })
  }

  return (a: T, b: T): number => {
    if (accessor.isDirectory(a) !== accessor.isDirectory(b)) {
      return accessor.isDirectory(a) ? -1 : 1
    }

    if (sortBy === 'name') {
      const result = compareByName(a, b)
      return sortOrder === 'desc' ? -result : result
    }

    const sortResult = compareOptionalNumber(getNumericValue(a), getNumericValue(b), sortOrder)
    if (sortResult !== 0) {
      return sortResult
    }

    const tieBreaker = compareByName(a, b)
    return sortOrder === 'desc' ? -tieBreaker : tieBreaker
  }
}
