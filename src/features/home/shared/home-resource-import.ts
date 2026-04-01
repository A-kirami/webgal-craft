import { AppError } from '~/types/errors'

export interface HomeResourceImportNotification {
  kind: 'success' | 'invalid-folder' | 'unknown-error' | 'multiple-folders'
  level: 'success' | 'error'
}

export interface HomeResourceDropPathDecision {
  shouldImport: boolean
  path?: string
  notification?: HomeResourceImportNotification
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

export function resolveHomeResourceImportNotification(error?: unknown): HomeResourceImportNotification {
  if (!error) {
    return {
      kind: 'success',
      level: 'success',
    }
  }

  if (error instanceof AppError && error.code === 'INVALID_STRUCTURE') {
    return {
      kind: 'invalid-folder',
      level: 'error',
    }
  }

  return {
    kind: 'unknown-error',
    level: 'error',
  }
}

export function hasHomeResourceProgress(activeProgress: ReadonlyMap<string, number>, resourceId: string): boolean {
  return activeProgress.has(resourceId)
}

export function getHomeResourceProgress(activeProgress: ReadonlyMap<string, number>, resourceId: string): number {
  return activeProgress.get(resourceId) ?? 0
}
