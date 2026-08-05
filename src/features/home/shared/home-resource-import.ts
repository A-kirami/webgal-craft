import { AppError } from '~/types/errors'

export interface HomeResourceImportNotification {
  kind:
    | 'success'
    | 'already-registered'
    | 'invalid-folder'
    | 'duplicate-resource'
    | 'target-conflict'
    | 'unsupported-legacy-engine'
    | 'engine-schema-too-new'
    | 'game-config-corrupted'
    | 'game-schema-too-new'
    | 'engine-not-found'
    | 'engine-unavailable'
    | 'engine-editor-incompatible'
    | 'engine-version-invalid'
    | 'engine-version-too-old'
    | 'import-cancelled'
    | 'unknown-error'
    | 'multiple-folders'
    | 'provider-denied'
    | 'copy-failed'
    | 'unsafe-entry'
    | 'storage-full'
    | 'resource-limit'
    | 'rollback-failed'
    | 'import-busy'
  level: 'silent' | 'info' | 'error'
}

export interface HomeResourceDropPathDecision {
  shouldImport: boolean
  path?: string
  notification?: HomeResourceImportNotification
}

export interface HomeResourceImportOutcome {
  alreadyRegistered?: boolean
}

export function resolveHomeResourceDropPath(paths: readonly string[]): HomeResourceDropPathDecision {
  if (paths.length !== 1) {
    return {
      shouldImport: false,
      notification: {
        kind: 'multiple-folders',
        level: 'error',
      },
    }
  }

  return {
    shouldImport: true,
    path: paths[0],
  }
}

export function resolveHomeResourceImportNotification(
  error?: unknown,
  outcome?: HomeResourceImportOutcome,
): HomeResourceImportNotification {
  if (!error) {
    if (outcome?.alreadyRegistered) {
      return { kind: 'already-registered', level: 'info' }
    }
    return { kind: 'success', level: 'silent' }
  }

  const kind = resolveErrorNotificationKind(error)
  let level: HomeResourceImportNotification['level'] = 'error'
  if (kind === 'import-cancelled') {
    level = 'silent'
  } else if (kind === 'import-busy') {
    level = 'info'
  }
  return { kind, level }
}

function resolveErrorNotificationKind(error: unknown): HomeResourceImportNotification['kind'] {
  if (!(error instanceof AppError)) {
    return 'unknown-error'
  }

  // 优先按 details.reason 匹配（更具体的错误分类）
  switch (error.details?.reason) {
    case 'PARSE_FAILED': { return 'invalid-folder' }
    case 'UNSUPPORTED_SCHEMA': { return 'engine-schema-too-new' }
    case 'LEGACY_ENGINE': { return 'unsupported-legacy-engine' }
    case 'ENGINE_NOT_FOUND': { return 'engine-not-found' }
    case 'ENGINE_UNAVAILABLE': { return 'engine-unavailable' }
    case 'ENGINE_EDITOR_INCOMPATIBLE': { return resolveEngineEditorIncompatibleNotificationKind(error) }
    case 'IMPORT_CANCELLED': { return 'import-cancelled' }
    case 'IMPORT_BUSY': { return 'import-busy' }
    default: { break }
  }

  // 按 error.code 匹配
  switch (error.code) {
    case 'INVALID_STRUCTURE': { return 'invalid-folder' }
    case 'INVALID_MANIFEST': { return 'invalid-folder' }
    case 'TARGET_CONFLICT': { return 'target-conflict' }
    case 'DUPLICATE_RESOURCE': { return 'duplicate-resource' }
    case 'INVALID_PROJECT_CONFIG': { return 'game-config-corrupted' }
    case 'SCHEMA_VERSION_TOO_NEW': { return 'game-schema-too-new' }
    case 'ENGINE_EDITOR_INCOMPATIBLE': { return resolveEngineEditorIncompatibleNotificationKind(error) }
    case 'PROVIDER_DENIED': { return 'provider-denied' }
    case 'COPY_FAILED': { return 'copy-failed' }
    case 'UNSAFE_ENTRY': { return 'unsafe-entry' }
    case 'STORAGE_FULL': { return 'storage-full' }
    case 'RESOURCE_LIMIT': { return 'resource-limit' }
    case 'ROLLBACK_FAILED': { return 'rollback-failed' }
    default: { return 'unknown-error' }
  }
}

function resolveEngineEditorIncompatibleNotificationKind(error: AppError): HomeResourceImportNotification['kind'] {
  switch (error.details?.issue) {
    case 'versionInvalid': { return 'engine-version-invalid' }
    case 'versionTooOld': { return 'engine-version-too-old' }
    default: { return 'engine-editor-incompatible' }
  }
}

export function hasHomeResourceProgress(activeProgress: ReadonlyMap<string, number>, resourceId: string): boolean {
  return activeProgress.has(resourceId)
}

export function getHomeResourceProgress(activeProgress: ReadonlyMap<string, number>, resourceId: string): number {
  return activeProgress.get(resourceId) ?? 0
}
