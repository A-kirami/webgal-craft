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
