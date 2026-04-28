/** 反斜杠统一为正斜杠 */
function toForwardSlash(path: string): string {
  return path.replaceAll('\\', '/')
}

export function toComparablePath(path: string): string {
  return toForwardSlash(path)
    .replace(/\/+$/, '')
    .toLocaleLowerCase()
}

export function normalizeFsPath(path: string): string {
  return toForwardSlash(path).replace(/\/+$/, '')
}

export function normalizeRelativePath(path: string): string {
  return toForwardSlash(path)
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

/**
 * 同步拼接路径片段，统一以 `/` 作为分隔符。
 *
 * 与 `@tauri-apps/api/path` 的 `join`（平台分隔符）刻意不同：
 * 本仓库内部路径字符串一律使用 `/`，与 `getParentPath` / `getBaseName` /
 * `normalizeFsPath` 等同模块工具保持一致；Tauri 后端、`plugin-fs`、
 * VFS 命令均接受 `/`，无需平台分支。
 */
export function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('/')
    .replaceAll(/[/\\]+/g, '/')
}

export function getBaseName(path: string): string {
  const normalized = toForwardSlash(path)
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1)
}

export function getParentPath(path: string): string {
  const normalized = toForwardSlash(path)
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash <= 0) {
    return normalized.slice(0, lastSlash + 1) || '/'
  }
  return normalized.slice(0, lastSlash)
}

export function buildUniqueEntryName(baseName: string, isDir: boolean, existingNames: ReadonlySet<string>): string {
  let counter = 1
  let nextName = baseName
  const lastDotIndex = baseName.lastIndexOf('.')
  const hasExt = !isDir && lastDotIndex > 0
  const ext = hasExt ? baseName.slice(lastDotIndex) : ''
  const nameWithoutExt = hasExt ? baseName.slice(0, lastDotIndex) : baseName

  while (existingNames.has(nextName)) {
    nextName = `${nameWithoutExt} (${counter})${ext}`
    counter++
  }

  return nextName
}
