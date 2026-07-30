import { db } from '~/database/db'
import { isAndroidRuntime } from '~/services/platform/runtime'
import { toLookupPathKey } from '~/services/resource-path/lookup'

import { androidDirectoryMaterializer } from './android-directory-materializer'

import type { DirectoryMaterializer, ImportResourceKind, RecoverableImportSession } from '~/types/managed-import'

interface ManagedImportRecoveryOptions {
  android?: boolean
  materializer?: DirectoryMaterializer
  findRegisteredResource?: (
    kind: ImportResourceKind,
    pathLookupKey: string,
  ) => Promise<{ id: string } | undefined>
}

async function findRegisteredResource(
  kind: ImportResourceKind,
  pathLookupKey: string,
): Promise<{ id: string } | undefined> {
  if (kind === 'game') {
    return db.games.where('pathLookupKey').equals(pathLookupKey).first()
  }
  if (kind === 'engine') {
    return db.engines.where('pathLookupKey').equals(pathLookupKey).first()
  }
  return db.templates.where('pathLookupKey').equals(pathLookupKey).first()
}

function canHavePublishedDirectory(session: RecoverableImportSession): boolean {
  return session.status === 'published' || session.status === 'registered'
}

async function recoverSession(
  session: RecoverableImportSession,
  materializer: DirectoryMaterializer,
  findResource: NonNullable<ManagedImportRecoveryOptions['findRegisteredResource']>,
): Promise<void> {
  if (!canHavePublishedDirectory(session) || !session.finalPath) {
    await materializer.rollback(session.sessionId)
    return
  }

  const registered = await findResource(
    session.resourceKind,
    toLookupPathKey(session.finalPath),
  )
  const operation = session.operation
  const matchesExpectedResource = registered && (operation.kind === 'relink'
    ? operation.existingGameId.length > 0 && registered.id === operation.existingGameId
    : !session.resourceId || registered.id === session.resourceId)

  await (matchesExpectedResource
    ? materializer.commit(session.sessionId, registered.id)
    : materializer.rollback(session.sessionId))
}

export async function recoverManagedImportSessions(
  options: ManagedImportRecoveryOptions = {},
): Promise<void> {
  if (!(options.android ?? isAndroidRuntime())) {
    return
  }

  const materializer = options.materializer ?? androidDirectoryMaterializer
  const findResource = options.findRegisteredResource ?? findRegisteredResource
  let sessions: RecoverableImportSession[]
  try {
    sessions = await materializer.listRecoverableSessions()
  } catch (error) {
    logger.error(`读取待恢复托管导入 session 失败: ${error}`)
    return
  }

  for (const session of sessions) {
    try {
      // 原生层回滚可能删除共用的引擎父目录，因此必须按持久化顺序恢复 session。
      // eslint-disable-next-line no-await-in-loop
      await recoverSession(session, materializer, findResource)
    } catch (error) {
      logger.error(`恢复托管导入 session 失败: session=${session.sessionId}, error=${error}`)
    }
  }
}
