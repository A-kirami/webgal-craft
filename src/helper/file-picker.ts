import { normalizeRelativePath, toComparablePath } from '~/utils/path'

export interface FilePickerInputParseResult {
  directoryPath: string
  keyword: string
  shouldNavigate: boolean
  rejectAbsolutePath: boolean
}

export interface FormatFilePickerModelValueForInputOptions {
  currentDir: string
  isOpen: boolean
}

const DEFAULT_FILE_PICKER_HISTORY_SCOPE_KEY = 'default'
const FILE_PICKER_RECENT_HISTORY_LIMIT = 20

function normalizeFilePickerInputPath(path: string): string {
  return path.trim().replaceAll('\\', '/')
}

function isAbsoluteFilePickerInput(path: string): boolean {
  const trimmed = path.trim()
  return trimmed.startsWith('/')
    || trimmed.startsWith('\\')
    || /^[a-zA-Z]:[\\/]/.test(trimmed)
}

export function formatFilePickerModelValueForInput(
  path: string,
  options: FormatFilePickerModelValueForInputOptions,
): string {
  const normalizedPath = normalizeRelativePath(path)
  const normalizedInput = normalizeFilePickerInputPath(path).replace(/^\/+/, '')

  if (options.isOpen && normalizedPath && normalizedPath === options.currentDir) {
    return `${normalizedPath}/`
  }

  if (normalizedInput.endsWith('/') && normalizedPath) {
    return `${normalizedPath}/`
  }

  return normalizedPath
}

export function parseFilePickerInput(input: string, fallbackDir: string): FilePickerInputParseResult {
  const normalized = normalizeFilePickerInputPath(input)
  const normalizedFallbackDir = normalizeRelativePath(fallbackDir)

  if (!normalized) {
    return { directoryPath: '', keyword: '', shouldNavigate: true, rejectAbsolutePath: false }
  }

  if (isAbsoluteFilePickerInput(input)) {
    return {
      directoryPath: normalizedFallbackDir,
      keyword: '',
      shouldNavigate: false,
      rejectAbsolutePath: true,
    }
  }

  if (!normalized.includes('/')) {
    return {
      directoryPath: normalizedFallbackDir,
      keyword: normalized,
      shouldNavigate: false,
      rejectAbsolutePath: false,
    }
  }

  if (normalized.endsWith('/')) {
    return {
      directoryPath: normalizeRelativePath(normalized),
      keyword: '',
      shouldNavigate: true,
      rejectAbsolutePath: false,
    }
  }

  const splitIndex = normalized.lastIndexOf('/')
  return {
    directoryPath: normalizeRelativePath(normalized.slice(0, splitIndex)),
    keyword: normalized.slice(splitIndex + 1),
    shouldNavigate: true,
    rejectAbsolutePath: false,
  }
}

export function getFilePickerParentPath(path: string): string {
  const normalized = normalizeRelativePath(path)
  const index = normalized.lastIndexOf('/')
  return index === -1 ? '' : normalized.slice(0, index)
}

export function getFilePickerName(path: string): string {
  const normalized = normalizeRelativePath(path)
  return normalized.split('/').at(-1) ?? normalized
}

export function resolveFilePickerHistoryStorageKey(canonicalRootPath: string, historyScopeKey: string): string {
  const normalizedRootPath = canonicalRootPath.trim()
  if (!normalizedRootPath) {
    return ''
  }

  const normalizedScopeKey = historyScopeKey.trim() || DEFAULT_FILE_PICKER_HISTORY_SCOPE_KEY
  return `${toComparablePath(normalizedRootPath)}::${normalizedScopeKey}`
}

export function insertFilePickerRecentHistoryPath(history: string[], relativePath: string): string[] {
  const normalizedPath = normalizeRelativePath(normalizeFilePickerInputPath(relativePath))
  if (!normalizedPath) {
    return history
  }

  return [normalizedPath, ...history.filter(item => item !== normalizedPath)]
    .slice(0, FILE_PICKER_RECENT_HISTORY_LIMIT)
}

export function removeFilePickerRecentHistoryPaths(history: string[], paths: string[]): string[] {
  if (paths.length === 0) {
    return history
  }

  const removeSet = new Set(paths)
  return history.filter(path => !removeSet.has(path))
}

export function resolveFilePickerInputFallbackDir(
  input: string,
  previousInput: string,
  fallbackDir: string,
): string {
  const normalizedFallbackDir = normalizeRelativePath(fallbackDir)
  if (!normalizedFallbackDir) {
    return normalizedFallbackDir
  }

  const normalizedInput = normalizeFilePickerInputPath(input)
  if (!normalizedInput || normalizedInput.includes('/')) {
    return normalizedFallbackDir
  }

  const normalizedPreviousInput = normalizeFilePickerInputPath(previousInput)
  const currentDirName = getFilePickerName(normalizedFallbackDir)
  if (normalizedPreviousInput === `${normalizedFallbackDir}/` && normalizedInput === currentDirName) {
    return getFilePickerParentPath(normalizedFallbackDir)
  }

  return normalizedFallbackDir
}
