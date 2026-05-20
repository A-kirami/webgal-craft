import { useHomeResourceImportActions } from '~/features/home/shared/useHomeResourceImportActions'
import { isEngineUsable } from '~/services/engine-manager'
import { gameManager } from '~/services/game-manager'
import { resourceReconcile } from '~/services/resource-reconcile'

import type { EngineStatus, Game } from '~/database/model'
import type { ResourceAvailability } from '~/services/resource-health'
import type { EngineSelectionContext } from '~/types/engine-selection'
import type { I18nT } from '~/utils/i18n-like'

interface EngineAvailabilityCheck {
  id: string
  status: EngineStatus
  availability: ResourceAvailability
}

interface UseGamesTabControllerOptions {
  activeProgress: ReadonlyMap<string, number>
  engines?: readonly EngineAvailabilityCheck[] | (() => readonly EngineAvailabilityCheck[] | undefined)
  openCreateGameModal: () => void
  openDeleteGameModal: (game: Game) => void
  openNoEngineAlertModal: (onConfirm: () => void) => void
  openRecoverGameModal: (game: Game) => void
  pushRoute: (path: string) => unknown
  selectEngine?: (context?: EngineSelectionContext) => Promise<string | undefined>
  t: I18nT
  switchToEnginesTab: () => void
}

export function useGamesTabController(options: UseGamesTabControllerOptions) {
  async function selectEngine(context?: EngineSelectionContext): Promise<string | undefined> {
    if (options.selectEngine) {
      return await options.selectEngine(context)
    }

    const { requestEngineSelection } = await import('~/features/modals/engine-selection/request-engine-selection')
    return await requestEngineSelection(context)
  }

  const importActions = useHomeResourceImportActions<Game>({
    activeProgress: options.activeProgress,
    importResource: path => gameManager.importGame(path, { selectEngine }),
    messages: {
      alreadyRegistered: t => t('home.games.importAlreadyExists'),
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

  async function handleGameClick(game: Game) {
    if (options.activeProgress.has(game.id)) {
      notify.warning(options.t('home.games.importCreating'))
      return
    }

    // 点击时即时校验：处理外部增删与外置盘恢复，避免基于过期 availability 误打开或误拦截
    const availability = await resourceReconcile.reconcileGameRecord(game)
    if (availability !== 'available') {
      options.openRecoverGameModal({ ...game, availability })
      return
    }

    options.pushRoute(`/edit/${game.id}`)
  }

  async function handleDeleteGame(game: Game) {
    // 删除入口同样即时校验：让 DeleteGameModal 拿到最新 availability，决定走"卸载文件"还是"只删记录"分支
    const availability = await resourceReconcile.reconcileGameRecord(game)
    options.openDeleteGameModal({ ...game, availability })
  }

  function createGame() {
    const engines = typeof options.engines === 'function'
      ? options.engines()
      : options.engines
    if (!engines) {
      return
    }

    const hasUsableEngine = engines.some(engine => isEngineUsable(engine))
    if (!hasUsableEngine) {
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
