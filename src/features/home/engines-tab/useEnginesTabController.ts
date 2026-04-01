import { useHomeResourceImportActions } from '~/features/home/shared/useHomeResourceImportActions'
import { engineManager } from '~/services/engine-manager'

import type { Engine } from '~/database/model'
import type { I18nT } from '~/utils/i18n-like'

interface UseEnginesTabControllerOptions {
  activeProgress: ReadonlyMap<string, number>
  openDeleteEngineModal: (engine: Engine) => void
  t: I18nT
}

export function useEnginesTabController(options: UseEnginesTabControllerOptions) {
  const importActions = useHomeResourceImportActions<Engine>({
    activeProgress: options.activeProgress,
    importResource: path => engineManager.importEngine(path),
    messages: {
      invalidFolder: t => t('home.engines.importInvalidFolder'),
      multipleFolders: t => t('home.engines.importMultipleFolders'),
      selectFolderTitle: t => t('common.dialogs.selectEngineFolder'),
      success: t => t('home.engines.importSuccess'),
      unknownError: t => t('home.engines.importUnknownError'),
    },
    t: options.t,
  })

  function handleDelete(engine: Engine) {
    options.openDeleteEngineModal(engine)
  }

  return {
    getEngineProgress: importActions.getProgress,
    handleDelete,
    handleDrop: importActions.handleDrop,
    handleOpenFolder: importActions.handleOpenFolder,
    hasEngineProgress: importActions.hasProgress,
    selectEngineFolder: importActions.selectFolder,
  }
}
