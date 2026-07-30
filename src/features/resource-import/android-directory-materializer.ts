import { Channel, invoke } from '@tauri-apps/api/core'

import { AbsPath } from '~/domain/path'

import type {
  DirectoryMaterializer,
  ImportResourceKind,
  ManagedImportProgress,
  RecoverableImportSession,
  SelectAndStageOptions,
  SelectAndStageResult,
} from '~/types/managed-import'

interface NativeStageResult {
  kind: 'cancelled' | 'staged'
  sessionId?: string
  stagingPath?: string
}

interface NativePublishedResult {
  finalPath: string
}

interface NativeSession {
  sessionId: string
  resourceKind: ImportResourceKind
  operation: { kind: 'import' | 'relink', existingGameId?: string }
  status: RecoverableImportSession['status']
  stagingPath?: string
  finalPath?: string
  resourceId?: string
  updatedAt: number
}

const pluginCommand = (command: string) => `android_resource_import_${command}`

function toStageResult(result: NativeStageResult): SelectAndStageResult {
  if (result.kind === 'cancelled') {
    return { kind: 'cancelled' }
  }

  if (!result.sessionId || !result.stagingPath) {
    throw new Error('Android materializer returned an incomplete staging result')
  }

  return {
    kind: 'staged',
    sessionId: result.sessionId,
    stagingPath: AbsPath.from(result.stagingPath),
  }
}

function toRecoverableSession(session: NativeSession): RecoverableImportSession {
  return {
    sessionId: session.sessionId,
    resourceKind: session.resourceKind,
    operation: session.operation.kind === 'relink'
      ? { kind: 'relink', existingGameId: session.operation.existingGameId ?? '' }
      : { kind: 'import' },
    status: session.status,
    stagingPath: session.stagingPath ? AbsPath.from(session.stagingPath) : undefined,
    finalPath: session.finalPath ? AbsPath.from(session.finalPath) : undefined,
    resourceId: session.resourceId,
    updatedAt: session.updatedAt,
  }
}

export function createAndroidDirectoryMaterializer(): DirectoryMaterializer {
  return {
    async selectAndStage(kind, options: SelectAndStageOptions = {}) {
      const progress = new Channel<ManagedImportProgress>(value => options.onProgress?.(value))
      const result = await invoke<NativeStageResult>(pluginCommand('select_and_stage'), {
        kind,
        operation: options.operation,
        onProgress: progress,
      })
      return toStageResult(result)
    },

    async publish(sessionId, finalRelativePath) {
      const result = await invoke<NativePublishedResult>(pluginCommand('publish'), {
        sessionId,
        finalRelativePath,
      })
      return { finalPath: AbsPath.from(result.finalPath) }
    },

    commit(sessionId, resourceId) {
      return invoke<void>(pluginCommand('commit'), { sessionId, resourceId })
    },

    rollback(sessionId) {
      return invoke<void>(pluginCommand('rollback'), { sessionId })
    },

    cancel(sessionId) {
      return invoke<void>(pluginCommand('cancel'), { sessionId })
    },

    async listRecoverableSessions() {
      const sessions = await invoke<NativeSession[]>(pluginCommand('list_recoverable_sessions'))
      return sessions.map(session => toRecoverableSession(session))
    },
  }
}

export const androidDirectoryMaterializer = createAndroidDirectoryMaterializer()
