import { dirname } from '@tauri-apps/api/path'
import { openPath } from '@tauri-apps/plugin-opener'

import { useHomeResourceImportActions } from '~/features/home/shared/useHomeResourceImportActions'
import { engineManager } from '~/services/engine-manager'

import type { Engine } from '~/database/model'
import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'
import type { I18nT } from '~/utils/i18n-like'

interface UseEnginesTabControllerOptions {
  activeProgress: ReadonlyMap<string, number>
  openDeleteEngineGroupModal: (engineId: string) => void
  openDeleteEngineModal: (engine: Engine) => void
  setDefaultEngineId: (engineId: string | undefined) => void
  t: I18nT
}

export function useEnginesTabController(options: UseEnginesTabControllerOptions) {
  const importActions = useHomeResourceImportActions<Engine>({
    activeProgress: options.activeProgress,
    importResource: path => engineManager.importEngine(path),
    messages: {
      alreadyRegistered: t => t('home.engines.importAlreadyExists'),
      engineSchemaTooNew: t => t('home.engines.importSchemaTooNew'),
      invalidFolder: t => t('home.engines.importInvalidFolder'),
      multipleFolders: t => t('home.engines.importMultipleFolders'),
      selectFolderTitle: t => t('common.dialogs.selectEngineFolder'),
      success: t => t('home.engines.importSuccess'),
      targetConflict: t => t('home.engines.importTargetConflict'),
      unsupportedLegacyEngine: t => t('home.engines.importUnsupportedLegacyEngine'),
      unknownError: t => t('home.engines.importUnknownError'),
    },
    t: options.t,
  })

  async function handleOpenGroupFolder(group: Pick<EngineGroupCollectionItem, 'engines' | 'representativeItem'>) {
    const sourceItem = group.representativeItem ?? group.engines[0]
    if (!sourceItem) {
      return
    }

    const targetPath = sourceItem.engine.version
      ? await dirname(sourceItem.engine.path)
      : sourceItem.engine.path
    await openPath(targetPath)
  }

  return {
    getEngineProgress: importActions.getProgress,
    handleDelete: options.openDeleteEngineModal,
    handleDeleteGroup: options.openDeleteEngineGroupModal,
    handleDrop: importActions.handleDrop,
    handleOpenGroupFolder,
    handleSetDefaultEngine: options.setDefaultEngineId,
    hasEngineProgress: importActions.hasProgress,
    selectEngineFolder: importActions.selectFolder,
  }
}
