import { Channel } from '@tauri-apps/api/core'

import { fromExternalAbsPath } from '~/services/platform/path-boundary'
import { safeInvoke } from '~/utils/invoke'

import type { AbsPath } from '~/domain/path'
import type {
  ImportResourceKind,
  ManagedImportProgress,
  RecoverableImportSession,
  SelectAndStageOptions,
  SelectAndStageResult,
} from '~/types/managed-import'

interface NativeManagedResourceRoots {
  engine: string
  export: string
  game: string
  template: string
}

interface NativePublishedResult {
  finalPath: string
}

interface NativeSession {
  finalPath?: string
  operation: { existingGameId?: string, kind: string }
  resourceId?: string
  resourceKind: ImportResourceKind
  sessionId: string
  stagingPath?: string
  status: RecoverableImportSession['status']
  updatedAt: number
}

interface NativeStageResult {
  kind: string
  sessionId?: string
  stagingPath?: string
}

export interface NativeResourceRoots {
  engine: AbsPath
  export: AbsPath
  game: AbsPath
  template: AbsPath
}

function toStageResult(result: NativeStageResult): SelectAndStageResult {
  switch (result.kind) {
    case 'cancelled': {
      return { kind: 'cancelled' }
    }
    case 'staged': {
      break
    }
    default: {
      throw new Error(`Android materializer returned an unknown staging result kind: ${result.kind}`)
    }
  }

  if (!result.sessionId || !result.stagingPath) {
    throw new Error('Android materializer returned an incomplete staging result')
  }

  return {
    kind: 'staged',
    sessionId: result.sessionId,
    stagingPath: fromExternalAbsPath(result.stagingPath),
  }
}

function toRecoverableSession(session: NativeSession): RecoverableImportSession {
  let operation: RecoverableImportSession['operation']
  switch (session.operation.kind) {
    case 'import': {
      operation = { kind: 'import' }
      break
    }
    case 'relink': {
      const { existingGameId } = session.operation
      if (!existingGameId) {
        throw new Error(`Recoverable session ${session.sessionId} has an invalid relink operation`)
      }
      operation = { kind: 'relink', existingGameId }
      break
    }
    default: {
      throw new Error(
        `Recoverable session ${session.sessionId} has an unknown operation kind: ${session.operation.kind}`,
      )
    }
  }

  return {
    sessionId: session.sessionId,
    resourceKind: session.resourceKind,
    operation,
    status: session.status,
    stagingPath: session.stagingPath ? fromExternalAbsPath(session.stagingPath) : undefined,
    finalPath: session.finalPath ? fromExternalAbsPath(session.finalPath) : undefined,
    resourceId: session.resourceId,
    updatedAt: session.updatedAt,
  }
}

async function selectAndStage(
  kind: ImportResourceKind,
  options: SelectAndStageOptions = {},
): Promise<SelectAndStageResult> {
  const onProgress = new Channel<ManagedImportProgress>(value => options.onProgress?.(value))
  const result = await safeInvoke<NativeStageResult>('android_resource_import_select_and_stage', {
    kind,
    operation: options.operation,
    onProgress,
  })
  return toStageResult(result)
}

async function publish(sessionId: string, finalRelativePath: string) {
  const result = await safeInvoke<NativePublishedResult>('android_resource_import_publish', {
    sessionId,
    finalRelativePath,
  })
  return { finalPath: fromExternalAbsPath(result.finalPath) }
}

function commit(sessionId: string, resourceId: string): Promise<void> {
  return safeInvoke('android_resource_import_commit', { sessionId, resourceId })
}

function rollback(sessionId: string): Promise<void> {
  return safeInvoke('android_resource_import_rollback', { sessionId })
}

function cancel(sessionId: string): Promise<void> {
  return safeInvoke('android_resource_import_cancel', { sessionId })
}

async function listRecoverableSessions(): Promise<RecoverableImportSession[]> {
  const sessions = await safeInvoke<NativeSession[]>('android_resource_import_list_recoverable_sessions')
  return sessions.map(session => toRecoverableSession(session))
}

async function resolveRoots(): Promise<NativeResourceRoots> {
  const roots = await safeInvoke<NativeManagedResourceRoots>('android_resource_import_resolve_roots')
  return {
    engine: fromExternalAbsPath(roots.engine),
    export: fromExternalAbsPath(roots.export),
    game: fromExternalAbsPath(roots.game),
    template: fromExternalAbsPath(roots.template),
  }
}

export const resourceImportCmds = {
  cancel,
  commit,
  listRecoverableSessions,
  publish,
  resolveRoots,
  rollback,
  selectAndStage,
}
