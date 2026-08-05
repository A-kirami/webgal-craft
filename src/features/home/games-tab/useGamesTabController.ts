import { MIN_WEBGAL_EDITOR_RUNTIME_VERSION } from '~/domain/engine/runtime-capabilities'
import { managedImportErrorMessages, useHomeResourceImportActions } from '~/features/home/shared/useHomeResourceImportActions'
import { requestGameRuntimeRebind, resolveRuntimeRebindIssue } from '~/features/modals/import-dependency-resolution/request-game-runtime-rebind'
import { requestImportDependencyResolution } from '~/features/modals/import-dependency-resolution/request-import-dependency-resolution'
import { createGameImportWorkflow } from '~/features/resource-import/resource-import-workflows'
import { isEngineEditorCompatible } from '~/services/engine-manager'
import { gameManager } from '~/services/game-manager'
import { resourceReconcile } from '~/services/resource-reconcile'
import { AppError } from '~/types/errors'

import type { Engine, Game } from '~/database/model'
import type { ResolveImportDependencies } from '~/types/import-dependency-resolution'
import type { I18nT } from '~/utils/i18n-like'

type EngineAvailabilityCheck = Pick<Engine, 'availability' | 'id' | 'metadata' | 'status'>

interface UseGamesTabControllerOptions {
  activeProgress: ReadonlyMap<string, number>
  android: boolean
  engines?: readonly EngineAvailabilityCheck[] | (() => readonly EngineAvailabilityCheck[] | undefined)
  openCreateGameModal: () => void
  openDeleteGameModal: (game: Game) => void
  openNoEngineAlertModal: (onConfirm: () => void) => void
  openRecoverGameModal: (game: Game) => void
  pushRoute: (path: string) => unknown
  resolveDependencies?: ResolveImportDependencies
  t: I18nT
  switchToEnginesTab: () => void
}

export function useGamesTabController(options: UseGamesTabControllerOptions) {
  const resolveDependencies = options.resolveDependencies ?? requestImportDependencyResolution
  const importWorkflow = createGameImportWorkflow({
    android: options.android,
    selectTitle: options.t('common.dialogs.selectGameFolder'),
    resolveDependencies,
    afterManagedCommit: gameId => options.pushRoute(`/edit/${gameId}`),
  })
  const importActions = useHomeResourceImportActions<Game>({
    activeProgress: options.activeProgress,
    importResource: path => gameManager.importGame(path, { resolveDependencies }),
    selectResource: importWorkflow.importFromPicker,
    messages: {
      ...managedImportErrorMessages,
      alreadyRegistered: t => t('home.games.importAlreadyExists'),
      engineEditorIncompatible: t => t('home.games.importEngineEditorIncompatible'),
      engineNotFound: t => t('home.games.importEngineNotFound'),
      engineUnavailable: t => t('home.games.importEngineUnavailable'),
      engineVersionInvalid: t => t('home.games.importEngineVersionInvalid'),
      engineVersionTooOld: t => t('home.games.importEngineVersionTooOld', { version: MIN_WEBGAL_EDITOR_RUNTIME_VERSION }),
      gameConfigCorrupted: t => t('home.games.importConfigCorrupted'),
      gameSchemaTooNew: t => t('home.games.importSchemaVersionTooNew'),
      invalidFolder: t => t('home.games.importInvalidFolder'),
      multipleFolders: t => t('home.games.importMultipleFolders'),
      selectFolderTitle: t => t('common.dialogs.selectGameFolder'),
      unknownError: t => t('home.games.importUnknownError'),
    },
    t: options.t,
  })

  async function handleGameClick(game: Game) {
    if (options.activeProgress.has(game.id)) {
      toast.warning(options.t('home.games.importCreating'))
      return
    }

    // 点击时即时校验：处理外部增删与外置盘恢复，避免基于过期 availability 误打开或误拦截
    const availability = await resourceReconcile.reconcileGameRecord(game)
    if (availability !== 'available') {
      options.openRecoverGameModal({ ...game, availability })
      return
    }

    const availableGame = { ...game, availability }
    try {
      await gameManager.ensureEditorRuntimeCompatible(availableGame)
    } catch (error) {
      if (error instanceof AppError && error.code === 'ENGINE_EDITOR_INCOMPATIBLE') {
        const rebound = await requestGameRuntimeRebind(availableGame, {
          ...resolveRuntimeRebindIssue(error.details?.issue),
          resolveDependencies,
        })
        if (rebound) {
          options.pushRoute(`/edit/${game.id}`)
        }
        return
      }
      throw error
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

    const hasUsableEngine = engines.some(engine => isEngineEditorCompatible(engine))
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
