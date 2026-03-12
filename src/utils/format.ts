const FILE_SIZE_UNITS = ['B', 'KiB', 'MiB', 'GiB'] as const

/** 格式化文件大小为人类可读的字符串 */
export function formatFileSize(bytes: number): string {
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < FILE_SIZE_UNITS.length - 1) {
    size /= 1024
    unitIndex++
  }

  if (unitIndex === 0) {
    return `${Math.round(size)} ${FILE_SIZE_UNITS[unitIndex]}`
  }

  const value = size < 10 ? size.toFixed(1) : String(Math.round(size))
  return `${value} ${FILE_SIZE_UNITS[unitIndex]}`
}
