import { openPath } from '@tauri-apps/plugin-opener'

import { db } from '~/database/db'
import { AbsPath } from '~/domain/path'
import { useHomeResourceImportActions } from '~/features/home/shared/useHomeResourceImportActions'
import { engineManager } from '~/services/engine-manager'
import { resourceReconcile } from '~/services/resource-reconcile'

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
      ? AbsPath.parent(AbsPath.from(sourceItem.engine.path))
      : sourceItem.engine.path
    await openPath(targetPath)
  }

  async function handleDelete(engine: Engine) {
    // 删除入口即时校验，确保 DeleteEngineModal 拿到最新 availability，决定走"卸载文件"还是"只删记录"
    const availability = await resourceReconcile.reconcileEngineRecord(engine)
    options.openDeleteEngineModal({ ...engine, availability })
  }

  async function handleDeleteGroup(engineId: string) {
    // 全版本删除前对组内每个版本即时校验，让弹窗的 allUnavailable 判断基于最新结果
    const engines = await db.engines.where('engineId').equals(engineId).toArray()
    await Promise.all(engines.map(engine => resourceReconcile.reconcileEngineRecord(engine)))
    options.openDeleteEngineGroupModal(engineId)
  }

  return {
    getEngineProgress: importActions.getProgress,
    handleDelete,
    handleDeleteGroup,
    handleDrop: importActions.handleDrop,
    handleOpenGroupFolder,
    handleSetDefaultEngine: options.setDefaultEngineId,
    hasEngineProgress: importActions.hasProgress,
    selectEngineFolder: importActions.selectFolder,
  }
}
