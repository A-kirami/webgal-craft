import { fromExternalAbsPath } from '~/services/platform/path-boundary'
import { safeInvoke } from '~/utils/invoke'

import type { AbsPath } from '~/domain/path'
import type { ImportResourceKind } from '~/types/managed-import'

interface NativeArchiveImportSession {
  rootPath: string
  sessionId: string
}

export interface ArchiveImportSession {
  rootPath: AbsPath
  sessionId: string
}

async function extract(archivePath: AbsPath, kind: ImportResourceKind): Promise<ArchiveImportSession> {
  const result = await safeInvoke<NativeArchiveImportSession>('extract_resource_archive', {
    archivePath,
    kind,
  })
  return {
    rootPath: fromExternalAbsPath(result.rootPath),
    sessionId: result.sessionId,
  }
}

function cleanup(sessionId: string): Promise<void> {
  return safeInvoke('cleanup_resource_archive', { sessionId })
}

export const archiveImportCmds = {
  cleanup,
  extract,
}
