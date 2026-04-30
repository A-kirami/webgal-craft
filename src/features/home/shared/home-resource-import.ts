import { AppError } from '~/types/errors'

export interface HomeResourceImportNotification {
  kind:
    | 'success'
    | 'already-registered'
    | 'invalid-folder'
    | 'duplicate-resource'
    | 'target-conflict'
    | 'unsupported-legacy-engine'
    | 'duplicate-engine'
    | 'engine-schema-too-new'
    | 'game-config-corrupted'
    | 'game-schema-too-new'
    | 'engine-not-found'
    | 'engine-unavailable'
    | 'import-cancelled'
    | 'unknown-error'
    | 'multiple-folders'
  level: 'success' | 'info' | 'error' | 'silent'
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
    return { kind: 'success', level: 'success' }
  }

  const kind = resolveErrorNotificationKind(error)
  const level = kind === 'import-cancelled' ? 'silent' : 'error'
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
    case 'DUPLICATE_ENGINE': { return 'duplicate-engine' }
    case 'ENGINE_NOT_FOUND': { return 'engine-not-found' }
    case 'ENGINE_UNAVAILABLE': { return 'engine-unavailable' }
    case 'IMPORT_CANCELLED': { return 'import-cancelled' }
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
    default: { return 'unknown-error' }
  }
}

export function hasHomeResourceProgress(activeProgress: ReadonlyMap<string, number>, resourceId: string): boolean {
  return activeProgress.has(resourceId)
}

export function getHomeResourceProgress(activeProgress: ReadonlyMap<string, number>, resourceId: string): number {
  return activeProgress.get(resourceId) ?? 0
}
