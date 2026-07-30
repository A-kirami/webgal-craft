import type { AbsPath } from '~/domain/path'

export type ImportResourceKind = 'game' | 'engine' | 'template'

export type ManagedImportPhase = 'copying' | 'validating' | 'publishing' | 'registering'

export interface ManagedImportProgress {
  sessionId: string
  resourceKind: ImportResourceKind
  phase: ManagedImportPhase
  copiedBytes: number
  copiedFiles: number
  currentEntry?: string
  totalBytes?: number
  totalFiles?: number
}

export type ManagedImportOperation =
  | { kind: 'import' }
  | { kind: 'relink', existingGameId: string }

export interface SelectAndStageOptions {
  operation?: ManagedImportOperation
  onProgress?: (progress: ManagedImportProgress) => void
}

export type SelectAndStageResult =
  | { kind: 'cancelled' }
  | { kind: 'staged', sessionId: string, stagingPath: AbsPath }

export interface PreparedManagedImport<TPlan> {
  finalRelativePath: string
  plan: TPlan
}

export type PrepareManagedImportResult<TPlan> =
  | { kind: 'duplicate', existingId: string }
  | { kind: 'ready', prepared: PreparedManagedImport<TPlan> }

export type ManagedImportSessionStatus =
  | 'selecting'
  | 'copying'
  | 'staged'
  | 'prepared'
  | 'published'
  | 'registered'
  | 'committed'
  | 'rolling-back'
  | 'rolled-back'

export interface RecoverableImportSession {
  sessionId: string
  resourceKind: ImportResourceKind
  operation: ManagedImportOperation
  status: ManagedImportSessionStatus
  stagingPath?: AbsPath
  finalPath?: AbsPath
  resourceId?: string
  updatedAt: number
}

/** Android 适配器边界，源 URI 和删除目标均不得越过此处。 */
export interface DirectoryMaterializer {
  selectAndStage: (
    kind: ImportResourceKind,
    options?: SelectAndStageOptions,
  ) => Promise<SelectAndStageResult>
  publish: (sessionId: string, finalRelativePath: string) => Promise<{ finalPath: AbsPath }>
  commit: (sessionId: string, resourceId: string) => Promise<void>
  rollback: (sessionId: string) => Promise<void>
  cancel: (sessionId: string) => Promise<void>
  listRecoverableSessions: () => Promise<RecoverableImportSession[]>
}
