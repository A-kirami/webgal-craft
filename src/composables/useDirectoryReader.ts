import { AbsPath } from '~/domain/path'
import { readDirectoryItemsCached } from '~/services/directory-cache'
import { AppError } from '~/types/errors'
import { FileViewerItem } from '~/types/file-viewer'

interface ReadDirectoryOptions {
  /** 根目录绝对路径（可选），用于做路径边界校验 */
  rootPath?: AbsPath
  /** 是否读取文件元信息（mtime/size 等），默认 true */
  includeStats?: boolean
  /** 外部传入请求 ID（可选） */
  requestId?: number
}

interface DirectoryReadResult {
  requestId: number
  absolutePath: AbsPath
  items: FileViewerItem[]
}

function isPathInsideRoot(path: AbsPath, rootPath: AbsPath): boolean {
  return path === rootPath || path.startsWith(`${rootPath}/`)
}

export function useDirectoryReader() {
  let latestRequestId = 0

  async function ensurePathWithinRoot(path: AbsPath, rootPath?: AbsPath): Promise<AbsPath> {
    if (!rootPath) {
      return path
    }

    if (!isPathInsideRoot(path, rootPath)) {
      throw new AppError('PATH_TRAVERSAL', '路径越界：访问路径不在根目录范围内')
    }
    return path
  }

  async function readDirectory(
    absolutePath: AbsPath,
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
