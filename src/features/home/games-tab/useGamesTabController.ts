import { open } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'
import { push as notify } from 'notivue'

import {
  getGamesTabProgress,
  hasGamesTabProgress,
  resolveGamesTabCreateGameDecision,
  resolveGamesTabGameClickDecision,
  resolveGamesTabImportDecision,
  resolveGamesTabImportResult,
} from '~/features/home/games-tab/games-tab'
import { gameManager } from '~/services/game-manager'

import type { Game } from '~/database/model'

interface UseGamesTabControllerOptions {
  activeProgress: ReadonlyMap<string, number>
  engines?: readonly { id: string }[] | (() => readonly { id: string }[] | undefined)
  openCreateGameModal: () => void
  openDeleteGameModal: (game: Game) => void
  openNoEngineAlertModal: (onConfirm: () => void) => void
  pushRoute: (path: string) => unknown
  t: (key: string) => string
  switchToEnginesTab: () => void
}

function resolveGamesTabNotificationMessage(t: (key: string) => string, messageKey: string): string {
  switch (messageKey) {
    case 'home.games.importSuccess': {
      return t('home.games.importSuccess')
    }
    case 'home.games.importInvalidFolder': {
      return t('home.games.importInvalidFolder')
    }
    case 'home.games.importUnknownError': {
      return t('home.games.importUnknownError')
    }
    case 'home.games.importMultipleFolders': {
      return t('home.games.importMultipleFolders')
    }
    case 'home.games.importCreating': {
      return t('home.games.importCreating')
    }
    default: {
      return messageKey
    }
  }
}

export function useGamesTabController(options: UseGamesTabControllerOptions) {
  function getGameProgress(game: Pick<Game, 'id'>): number {
    return getGamesTabProgress(game.id, options.activeProgress)
  }

  function hasGameProgress(game: Pick<Game, 'id'>): boolean {
    return hasGamesTabProgress(game.id, options.activeProgress)
  }

  async function importGameWithNotify(path: string) {
    try {
      await gameManager.importGame(path)
    } catch (error: unknown) {
      const result = resolveGamesTabImportResult(error)
      notify[result.level](resolveGamesTabNotificationMessage(options.t, result.messageKey))
      return
    }

    const result = resolveGamesTabImportResult()
    notify[result.level](resolveGamesTabNotificationMessage(options.t, result.messageKey))
  }

  async function handleDrop(paths: string[]) {
    const decision = resolveGamesTabImportDecision(paths)
    if (decision.kind === 'notify') {
      notify[decision.level](resolveGamesTabNotificationMessage(options.t, decision.messageKey))
      return
    }

    await importGameWithNotify(decision.path)
  }

  async function selectGameFolder() {
    const path = await open({
      title: options.t('common.dialogs.selectGameFolder'),
      directory: true,
      multiple: false,
    })

    if (path) {
      await importGameWithNotify(path)
    }
  }

  async function handleOpenFolder(game: Pick<Game, 'path'>) {
    await openPath(game.path)
  }

  function handleDeleteGame(game: Game) {
    options.openDeleteGameModal(game)
  }

  function handleGameClick(game: Pick<Game, 'id'>) {
    const decision = resolveGamesTabGameClickDecision(game.id, options.activeProgress)
    if (decision.kind === 'notify') {
      notify[decision.level](resolveGamesTabNotificationMessage(options.t, decision.messageKey))
      return
    }

    options.pushRoute(`/edit/${decision.gameId}`)
  }

  function createGame() {
    const engines = typeof options.engines === 'function'
      ? options.engines()
      : options.engines
    const decision = resolveGamesTabCreateGameDecision(engines)
    if (decision.kind === 'none') {
      return
    }

    if (decision.kind === 'open-no-engine-alert') {
      options.openNoEngineAlertModal(options.switchToEnginesTab)
      return
    }

    options.openCreateGameModal()
  }

  return {
    createGame,
    getGameProgress,
    handleDeleteGame,
    handleDrop,
    handleGameClick,
    handleOpenFolder,
    hasGameProgress,
    selectGameFolder,
  }
}
