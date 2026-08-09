import { openPath, openUrl } from '@tauri-apps/plugin-opener'

import { db } from '~/database/db'
import {
  filterSupportedOfficialEngineReleases,
  OFFICIAL_WEBGAL_REPOSITORY,
} from '~/domain/engine/official-release'
import { AbsPath } from '~/domain/path'
import { createHomeResourceImportMessages, useHomeResourceImportActions } from '~/features/home/shared/useHomeResourceImportActions'
import { createEngineImportWorkflow } from '~/features/resource-import/resource-import-workflows'
import { engineManager } from '~/services/engine-manager'
import { resourceReconcile } from '~/services/resource-reconcile'
import { useOfficialEngineReleaseCacheStore } from '~/stores/official-engine-release-cache'

import type { Engine } from '~/database/model'
import type { OfficialEngineRelease } from '~/domain/engine/official-release'
import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'
import type { I18nT } from '~/utils/i18n-like'

interface UseEnginesTabControllerOptions {
  activeProgress: ReadonlyMap<string, number>
  android: boolean
  openDeleteEngineGroupModal: (engineId: string, options: { allUnavailable: boolean }) => void
  openDeleteEngineModal: (engine: Engine) => void
  setDefaultEngineId: (engineId: string | undefined) => void
  t: I18nT
}

export function useEnginesTabController(options: UseEnginesTabControllerOptions) {
  const importWorkflow = createEngineImportWorkflow(options.t('common.dialogs.selectEngineFolder'), options.android)
  const officialReleaseCacheStore = useOfficialEngineReleaseCacheStore()
  const officialReleases = shallowRef<OfficialEngineRelease[]>(
    filterSupportedOfficialEngineReleases(officialReleaseCacheStore.releases),
  )
  const officialStatus = shallowRef<'loading' | 'ready' | 'installing' | 'error'>(
    officialReleases.value.length > 0 ? 'ready' : 'loading',
  )
  const importActions = useHomeResourceImportActions<Engine>({
    activeProgress: options.activeProgress,
    importResource: path => engineManager.importEngine(path),
    selectResource: importWorkflow.importFromPicker,
    messages: createHomeResourceImportMessages('engines', options.t),
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
    const latestAvailability = await Promise.all(engines.map(engine => resourceReconcile.reconcileEngineRecord(engine)))
    const allUnavailable = latestAvailability.length > 0
      && latestAvailability.every(availability => availability !== 'available')

    options.openDeleteEngineGroupModal(engineId, { allUnavailable })
  }

  async function loadOfficialEngineReleases(): Promise<void> {
    const hasCachedReleases = officialReleaseCacheStore.releases.length > 0
    if (!hasCachedReleases) {
      officialStatus.value = 'loading'
    }
    try {
      const latestRelease = await engineManager.getLatestOfficialEngineRelease()
      if (!hasCachedReleases || officialReleaseCacheStore.latestVersion !== latestRelease.version) {
        officialReleaseCacheStore.replaceReleases(
          await engineManager.getOfficialEngineReleases(),
          latestRelease.version,
        )
      }
      officialReleases.value = filterSupportedOfficialEngineReleases(officialReleaseCacheStore.releases)
      officialStatus.value = 'ready'
    } catch (error) {
      officialStatus.value = officialReleases.value.length > 0 ? 'ready' : 'error'
      logger.warn(`[官方引擎] 获取版本失败: ${error}`)
    }
  }

  async function installOfficialEngine(version: string): Promise<void> {
    if (officialStatus.value === 'installing') {
      return
    }

    officialStatus.value = 'installing'
    try {
      const result = await engineManager.installOfficialEngine(version)
      if (!officialReleases.value.some(release => release.version === result.release.version)) {
        officialReleaseCacheStore.replaceReleases([
          ...officialReleaseCacheStore.releases,
          result.release,
        ], officialReleaseCacheStore.latestVersion ?? result.release.version)
        officialReleases.value = filterSupportedOfficialEngineReleases(officialReleaseCacheStore.releases)
      }
      officialStatus.value = 'ready'
      toast.success(result.alreadyRegistered
        ? options.t('home.engines.official.alreadyInstalled')
        : options.t('home.engines.official.installSuccess', { version: result.release.version }))
    } catch (error) {
      officialStatus.value = officialReleases.value.length > 0 ? 'ready' : 'error'
      logger.warn(`[官方引擎] 安装失败: ${error}`)
      toast.error(options.t('home.engines.official.installFailed'))
    }
  }

  async function openOfficialRelease(): Promise<void> {
    await openUrl(`https://github.com/${OFFICIAL_WEBGAL_REPOSITORY}/releases`)
  }

  async function openOfficialVersionRelease(releaseUrl: string): Promise<void> {
    await openUrl(releaseUrl)
  }

  return {
    getEngineProgress: (engine: Engine) => importActions.hasProgress(engine)
      ? importActions.getProgress(engine)
      : undefined,
    handleDelete,
    handleDeleteGroup,
    handleDrop: importActions.handleDrop,
    handleOpenGroupFolder,
    handleSetDefaultEngine: options.setDefaultEngineId,
    installOfficialEngine,
    loadOfficialEngineReleases,
    openOfficialRelease,
    openOfficialVersionRelease,
    officialReleases,
    officialStatus,
    selectEngineFolder: importActions.selectFolder,
  }
}
