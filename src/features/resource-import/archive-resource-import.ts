import { archiveImportCmds } from '~/commands/archive-import'

import type { AbsPath } from '~/domain/path'
import type { HomeResourceImportOutcome } from '~/features/home/shared/home-resource-import'
import type { ImportResourceKind } from '~/types/managed-import'

const ARCHIVE_FILE_PATTERN = /\.(?:zip|tar|tar\.gz|tgz|rar|7z|gz|bz2|xz)$/i

export function isArchiveImportPath(path: string): boolean {
  return ARCHIVE_FILE_PATTERN.test(path)
}

export async function importResourceArchive(
  kind: ImportResourceKind,
  archivePath: AbsPath,
  importDirectory: (path: AbsPath) => Promise<HomeResourceImportOutcome | unknown>,
): Promise<HomeResourceImportOutcome | unknown> {
  const session = await archiveImportCmds.extract(archivePath, kind)
  try {
    return await importDirectory(session.rootPath)
  } finally {
    try {
      await archiveImportCmds.cleanup(session.sessionId)
    } catch (error) {
      logger.warn(`[压缩包导入] 临时目录清理失败: session=${session.sessionId}, error=${error}`)
    }
  }
}
