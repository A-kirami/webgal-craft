import { open } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'
import { push as notify } from 'notivue'

import {
  evaluateDropImportPaths,
  getEngineProgressValue,
  getImportNotificationForResult,
  isEngineProcessing,
  resolveSelectedPath,
} from '~/helper/engines-tab'
import { engineManager } from '~/services/engine-manager'

import type { Engine } from '~/database/model'

interface UseEnginesTabControllerOptions {
  activeProgress: ReadonlyMap<string, number>
  openDeleteEngineModal: (engine: Engine) => void
  t: (key: string) => string
}

function resolveEnginesTabNotificationMessage(t: (key: string) => string, messageKey: string): string {
  switch (messageKey) {
    case 'home.engines.importSuccess': {
      return t('home.engines.importSuccess')
    }
    case 'home.engines.importInvalidFolder': {
      return t('home.engines.importInvalidFolder')
    }
    case 'home.engines.importUnknownError': {
      return t('home.engines.importUnknownError')
    }
    case 'home.engines.importMultipleFolders': {
      return t('home.engines.importMultipleFolders')
    }
    default: {
      return messageKey
    }
  }
}

export function useEnginesTabController(options: UseEnginesTabControllerOptions) {
  function getEngineProgress(engine: Pick<Engine, 'id'>): number {
    return getEngineProgressValue(options.activeProgress, engine.id) ?? 0
  }

  function hasEngineProgress(engine: Pick<Engine, 'id'>): boolean {
    return isEngineProcessing(options.activeProgress, engine.id)
  }

  async function importEngineWithNotify(path: string) {
    let error: unknown

    try {
      await engineManager.importEngine(path)
    } catch (error_: unknown) {
      error = error_
    }

    const notification = getImportNotificationForResult(error)
    if (notification.variant === 'success') {
      notify.success(resolveEnginesTabNotificationMessage(options.t, notification.key))
      return
    }

    notify.error(resolveEnginesTabNotificationMessage(options.t, notification.key))
  }

  async function handleDrop(paths: string[]) {
    const decision = evaluateDropImportPaths(paths)
    if (!decision.shouldImport) {
      if (decision.notification) {
        notify.error(resolveEnginesTabNotificationMessage(options.t, decision.notification.key))
      }
      return
    }

    if (decision.path) {
      await importEngineWithNotify(decision.path)
    }
  }

  async function selectEngineFolder() {
    const path = await open({
      title: options.t('common.dialogs.selectEngineFolder'),
      directory: true,
      multiple: false,
    })
    const resolved = resolveSelectedPath(path)

    if (resolved) {
      await importEngineWithNotify(resolved)
    }
  }

  async function handleOpenFolder(engine: Pick<Engine, 'path'>) {
    await openPath(engine.path)
  }

  function handleDelete(engine: Engine) {
    options.openDeleteEngineModal(engine)
  }

  return {
    getEngineProgress,
    handleDelete,
    handleDrop,
    handleOpenFolder,
    hasEngineProgress,
    selectEngineFolder,
  }
}
