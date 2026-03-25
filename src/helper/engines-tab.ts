import { AppError } from '~/types/errors'

export interface NotificationIntent {
  key: string
  variant: 'success' | 'error'
}

export interface DropImportDecision {
  shouldImport: boolean
  path?: string
  notification?: NotificationIntent
}

export function evaluateDropImportPaths(paths: string[]): DropImportDecision {
  if (paths.length !== 1) {
    return {
      shouldImport: false,
      notification: {
        key: 'home.engines.importMultipleFolders',
        variant: 'error',
      },
    }
  }

  return {
    shouldImport: true,
    path: paths[0],
  }
}

export function getImportNotificationForResult(error?: unknown): NotificationIntent {
  if (!error) {
    return {
      key: 'home.engines.importSuccess',
      variant: 'success',
    }
  }

  if (error instanceof AppError && error.code === 'INVALID_STRUCTURE') {
    return {
      key: 'home.engines.importInvalidFolder',
      variant: 'error',
    }
  }

  return {
    key: 'home.engines.importUnknownError',
    variant: 'error',
  }
}

export function resolveSelectedPath(selection: string | string[] | null | undefined): string | undefined {
  if (!selection) {
    return undefined
  }

  if (Array.isArray(selection)) {
    if (selection.length === 0) {
      return undefined
    }

    return selection[0]
  }

  return selection
}

export function isEngineProcessing(activeProgress: ReadonlyMap<string, number>, engineId: string): boolean {
  return activeProgress.has(engineId)
}

export function getEngineProgressValue(activeProgress: ReadonlyMap<string, number>, engineId: string): number | undefined {
  return activeProgress.get(engineId)
}
