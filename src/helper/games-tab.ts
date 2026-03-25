import { AppError } from '~/types/errors'

export interface GamesTabEngineOptionLike {
  id: string
}

export interface GamesTabNotifyDecision {
  kind: 'notify'
  level: 'error' | 'success' | 'warning'
  messageKey: string
}

export interface GamesTabImportPathDecision {
  kind: 'import'
  path: string
}

export interface GamesTabOpenEditorDecision {
  kind: 'open-editor'
  gameId: string
}

export interface GamesTabNoopDecision {
  kind: 'none'
}

export interface GamesTabOpenCreateGameModalDecision {
  kind: 'open-create-game-modal'
}

export interface GamesTabOpenNoEngineAlertDecision {
  kind: 'open-no-engine-alert'
  titleKey: string
  contentKey: string
  confirmTextKey: string
  cancelTextKey: string
}

export type GamesTabImportDecision = GamesTabImportPathDecision | GamesTabNotifyDecision
export type GamesTabGameClickDecision = GamesTabOpenEditorDecision | GamesTabNotifyDecision
export type GamesTabCreateGameDecision =
  | GamesTabNoopDecision
  | GamesTabOpenCreateGameModalDecision
  | GamesTabOpenNoEngineAlertDecision

export function getGamesTabProgress(gameId: string, activeProgress: ReadonlyMap<string, number>): number {
  return activeProgress.get(gameId) ?? 0
}

export function hasGamesTabProgress(gameId: string, activeProgress: ReadonlyMap<string, number>): boolean {
  return activeProgress.has(gameId)
}

export function resolveGamesTabImportDecision(paths: readonly string[]): GamesTabImportDecision {
  if (paths.length !== 1) {
    return {
      kind: 'notify',
      level: 'error',
      messageKey: 'home.games.importMultipleFolders',
    }
  }

  return {
    kind: 'import',
    path: paths[0],
  }
}

export function resolveGamesTabImportResult(error?: unknown): GamesTabNotifyDecision {
  if (!error) {
    return {
      kind: 'notify',
      level: 'success',
      messageKey: 'home.games.importSuccess',
    }
  }

  if (error instanceof AppError && error.code === 'INVALID_STRUCTURE') {
    return {
      kind: 'notify',
      level: 'error',
      messageKey: 'home.games.importInvalidFolder',
    }
  }

  return {
    kind: 'notify',
    level: 'error',
    messageKey: 'home.games.importUnknownError',
  }
}

export function resolveGamesTabGameClickDecision(
  gameId: string,
  activeProgress: ReadonlyMap<string, number>,
): GamesTabGameClickDecision {
  if (hasGamesTabProgress(gameId, activeProgress)) {
    return {
      kind: 'notify',
      level: 'warning',
      messageKey: 'home.games.importCreating',
    }
  }

  return {
    kind: 'open-editor',
    gameId,
  }
}

export function resolveGamesTabCreateGameDecision(
  engines: readonly GamesTabEngineOptionLike[] | undefined,
): GamesTabCreateGameDecision {
  if (!engines) {
    return {
      kind: 'none',
    }
  }

  if (engines.length > 0) {
    return {
      kind: 'open-create-game-modal',
    }
  }

  return {
    kind: 'open-no-engine-alert',
    titleKey: 'home.engines.noEngineTitle',
    contentKey: 'home.engines.noEngineContent',
    confirmTextKey: 'home.engines.goToInstall',
    cancelTextKey: 'home.engines.later',
  }
}
