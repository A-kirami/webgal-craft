import { normalize } from '@tauri-apps/api/path'

interface ReadDirectoryOptions {
  /** 根目录绝对路径（可选），用于做路径边界校验 */
  rootPath?: string
  /** 是否读取文件元信息（mtime/size 等），默认 true */
  includeStats?: boolean
  /** 外部传入请求 ID（可选） */
  requestId?: number
}

interface DirectoryReadResult {
  requestId: number
  absolutePath: string
  items: FileViewerItem[]
}

function toComparablePath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .replace(/\/+$/, '')
    .toLocaleLowerCase()
}

function isPathInsideRoot(path: string, rootPath: string): boolean {
  const normalizedPath = toComparablePath(path)
  const normalizedRootPath = toComparablePath(rootPath)
  return normalizedPath === normalizedRootPath
    || normalizedPath.startsWith(`${normalizedRootPath}/`)
}

export function useDirectoryReader() {
  let latestRequestId = 0

  async function ensurePathWithinRoot(path: string, rootPath?: string): Promise<string> {
    const normalizedPath = await normalize(path)
    if (!rootPath) {
      return normalizedPath
    }

    const normalizedRootPath = await normalize(rootPath)
    if (!isPathInsideRoot(normalizedPath, normalizedRootPath)) {
      throw new Error('路径越界：访问路径不在根目录范围内')
    }
    return normalizedPath
  }

  async function readDirectory(
    absolutePath: string,
    options: ReadDirectoryOptions = {},
  ): Promise<DirectoryReadResult> {
    const requestId = options.requestId ?? ++latestRequestId
    const includeStats = options.includeStats ?? true

    const safePath = await ensurePathWithinRoot(absolutePath, options.rootPath)
    const items = await readDirectoryItemsCached(safePath, { includeStats })

    return {
      requestId,
      absolutePath: safePath,
      items,
    }
  }

  return {
    readDirectory,
    ensurePathWithinRoot,
  }
}
