import { push as notify } from 'notivue'

import { useHomeResourceImportActions } from '~/features/home/shared/useHomeResourceImportActions'
import { gameManager } from '~/services/game-manager'

import type { Game } from '~/database/model'
import type { I18nT } from '~/utils/i18n-like'

interface UseGamesTabControllerOptions {
  activeProgress: ReadonlyMap<string, number>
  engines?: readonly { id: string }[] | (() => readonly { id: string }[] | undefined)
  openCreateGameModal: () => void
  openDeleteGameModal: (game: Game) => void
  openNoEngineAlertModal: (onConfirm: () => void) => void
  pushRoute: (path: string) => unknown
  t: I18nT
  switchToEnginesTab: () => void
}

function isGameProcessing(activeProgress: ReadonlyMap<string, number>, gameId: string): boolean {
  return activeProgress.has(gameId)
}

export function useGamesTabController(options: UseGamesTabControllerOptions) {
  const importActions = useHomeResourceImportActions<Game>({
    activeProgress: options.activeProgress,
    importResource: path => gameManager.importGame(path),
    messages: {
      invalidFolder: t => t('home.games.importInvalidFolder'),
      multipleFolders: t => t('home.games.importMultipleFolders'),
      selectFolderTitle: t => t('common.dialogs.selectGameFolder'),
      success: t => t('home.games.importSuccess'),
      unknownError: t => t('home.games.importUnknownError'),
    },
    t: options.t,
  })

  function handleDeleteGame(game: Game) {
    options.openDeleteGameModal(game)
  }

  function handleGameClick(game: Pick<Game, 'id'>) {
    if (isGameProcessing(options.activeProgress, game.id)) {
      notify.warning(options.t('home.games.importCreating'))
      return
    }

    options.pushRoute(`/edit/${game.id}`)
  }

  function createGame() {
    const engines = typeof options.engines === 'function'
      ? options.engines()
      : options.engines
    if (!engines) {
      return
    }

    if (engines.length === 0) {
      options.openNoEngineAlertModal(options.switchToEnginesTab)
      return
    }

    options.openCreateGameModal()
  }

  return {
    createGame,
    getGameProgress: importActions.getProgress,
    handleDeleteGame,
    handleDrop: importActions.handleDrop,
    handleGameClick,
    handleOpenFolder: importActions.handleOpenFolder,
    hasGameProgress: importActions.hasProgress,
    selectGameFolder: importActions.selectFolder,
  }
}
