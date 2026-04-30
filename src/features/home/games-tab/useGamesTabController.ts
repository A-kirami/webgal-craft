import { useHomeResourceImportActions } from '~/features/home/shared/useHomeResourceImportActions'
import { gameManager } from '~/services/game-manager'

import type { EngineStatus, Game } from '~/database/model'
import type { EngineRef } from '~/types/project-config'
import type { I18nT } from '~/utils/i18n-like'

interface UseGamesTabControllerOptions {
  activeProgress: ReadonlyMap<string, number>
  engines?: readonly { id: string, status: EngineStatus }[] | (() => readonly { id: string, status: EngineStatus }[] | undefined)
  openCreateGameModal: () => void
  openDeleteGameModal: (game: Game) => void
  openNoEngineAlertModal: (onConfirm: () => void) => void
  pushRoute: (path: string) => unknown
  selectEngine?: (hint?: EngineRef) => Promise<string | undefined>
  t: I18nT
  switchToEnginesTab: () => void
}

export function useGamesTabController(options: UseGamesTabControllerOptions) {
  async function selectEngine(hint?: EngineRef): Promise<string | undefined> {
    if (options.selectEngine) {
      return await options.selectEngine(hint)
    }

    const { requestEngineSelection } = await import('~/features/modals/engine-selection/request-engine-selection')
    return await requestEngineSelection(hint)
  }

  const importActions = useHomeResourceImportActions<Game>({
    activeProgress: options.activeProgress,
    importResource: path => gameManager.importGame(path, { selectEngine }),
    messages: {
      engineNotFound: t => t('home.games.importEngineNotFound'),
      engineUnavailable: t => t('home.games.importEngineUnavailable'),
      gameConfigCorrupted: t => t('home.games.importConfigCorrupted'),
      gameSchemaTooNew: t => t('home.games.importSchemaVersionTooNew'),
      invalidFolder: t => t('home.games.importInvalidFolder'),
      importCancelled: t => t('home.games.importCancelled'),
      multipleFolders: t => t('home.games.importMultipleFolders'),
      selectFolderTitle: t => t('common.dialogs.selectGameFolder'),
      success: t => t('home.games.importSuccess'),
      unknownError: t => t('home.games.importUnknownError'),
    },
    t: options.t,
  })

  function handleGameClick(game: Pick<Game, 'id'>) {
    if (options.activeProgress.has(game.id)) {
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

    const hasUsableEngine = engines.some(engine => engine.status === 'created')
    if (!hasUsableEngine) {
      options.openNoEngineAlertModal(options.switchToEnginesTab)
      return
    }

    options.openCreateGameModal()
  }

  return {
    createGame,
    getGameProgress: importActions.getProgress,
    handleDeleteGame: options.openDeleteGameModal,
    handleDrop: importActions.handleDrop,
    handleGameClick,
    handleOpenFolder: importActions.handleOpenFolder,
    hasGameProgress: importActions.hasProgress,
    selectGameFolder: importActions.selectFolder,
  }
}
