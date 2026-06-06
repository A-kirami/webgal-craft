import {
  createDefaultToastApi,
  getDownloadProgressToastKey,
} from '~/features/app-update/app-update-toast'
import { hasUpdateInstallBlockers } from '~/features/app-update/update-install-blockers'
import { appUpdateService } from '~/services/app-update/update-service'
import { useAppUpdateStore } from '~/stores/app-update'
import { useModalStore } from '~/stores/modal'

import type { AppUpdateToastActions, AppUpdateToastApi } from '~/features/app-update/app-update-toast'
import type { AppUpdateInfo, AppUpdateService } from '~/services/app-update/update-service'

type AppUpdateCheckReason = 'startup' | 'manual'
type AppUpdateStore = ReturnType<typeof useAppUpdateStore>

interface ModalStoreAdapter {
  open(name: 'UpdateDetailsModal', props?: object): void
}

interface AppUpdateControllerDependencies {
  appUpdateStore: AppUpdateStore
  hasInstallBlockers: () => boolean
  modalStore: ModalStoreAdapter
  service: AppUpdateService
  toastApi: AppUpdateToastApi
}

interface PendingUpdateCheck {
  promise: Promise<AppUpdateInfo | undefined>
  showResult: boolean
}

const STARTUP_UPDATE_CHECK_TIMEOUT_MS = 10 * 1000
const MANUAL_UPDATE_CHECK_TIMEOUT_MS = 20 * 1000
const CHECK_UPDATE_FAILED_MESSAGE = '检查更新失败'
let pendingCheck: PendingUpdateCheck | undefined

function collectErrorMessages(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return [String(error)]
  }

  const messages = error.message ? [error.message] : []
  if (error.cause !== undefined) {
    messages.push(...collectErrorMessages(error.cause))
  }

  return messages
}

function toErrorMessage(error: unknown, skippedMessages: readonly string[] = []): string {
  const messages = collectErrorMessages(error)
    .filter((message, index, messages_) => message !== messages_[index - 1])

  const visibleMessages = messages.filter(message => !skippedMessages.includes(message))
  const errorMessages = visibleMessages.length > 0 ? visibleMessages : messages

  return errorMessages.join(': ') || String(error)
}

function toCheckErrorLogMessage(message: string): string {
  return message === CHECK_UPDATE_FAILED_MESSAGE
    ? '检查应用更新失败'
    : `检查应用更新失败: ${message}`
}

export function createAppUpdateController(deps: AppUpdateControllerDependencies) {
  const {
    appUpdateStore,
    hasInstallBlockers,
    modalStore,
    service,
    toastApi,
  } = deps

  function openUpdateDetails(): void {
    modalStore.open('UpdateDetailsModal', {
      onOpenReleasePage: openReleasePage,
      onSkipVersion: skipAvailableVersion,
      onUpdateNow: runUpdateAction,
    })
  }

  async function openReleasePage(version?: string): Promise<void> {
    try {
      await service.openReleasePage(version)
    } catch (error) {
      logger.error(`打开应用发布页失败: ${toErrorMessage(error)}`)
    }
  }

  function createToastActions(): AppUpdateToastActions {
    return {
      onUpdateNow: () => {
        void runUpdateAction()
      },
      onViewUpdate: openUpdateDetails,
    }
  }

  function handleUpdateError(error: unknown, nextStatus: AppUpdateStore['status'] = 'error'): void {
    const message = toErrorMessage(error)
    appUpdateStore.setError('update-failed', message, nextStatus)
    logger.error(`下载或安装应用更新失败: ${message}`)
    toastApi.updateFailed(createToastActions())
  }

  async function checkForUpdate(reason: AppUpdateCheckReason): Promise<AppUpdateInfo | undefined> {
    const isManualCheck = reason === 'manual'

    if (pendingCheck) {
      if (isManualCheck) {
        pendingCheck.showResult = true
        toastApi.checkStarted()
      }
      return pendingCheck.promise
    }

    const isUpdateFlowBusy = appUpdateStore.isUpdating
      || appUpdateStore.isDownloaded
      || appUpdateStore.isInstalled
      || appUpdateStore.isRestarting

    if (isUpdateFlowBusy) {
      return appUpdateStore.availableUpdate
    }

    if (isManualCheck) {
      toastApi.checkStarted()
    }
    const currentCheck: PendingUpdateCheck = {
      promise: runUpdateCheck(reason),
      showResult: isManualCheck,
    }
    pendingCheck = currentCheck
    try {
      const update = await currentCheck.promise
      if (currentCheck.showResult) {
        showManualCheckResult(update)
      }
      return update
    } finally {
      if (pendingCheck === currentCheck) {
        pendingCheck = undefined
      }
    }
  }

  async function runUpdateCheck(reason: AppUpdateCheckReason): Promise<AppUpdateInfo | undefined> {
    const isManualCheck = reason === 'manual'

    appUpdateStore.setChecking()
    try {
      const timeoutMs = reason === 'startup'
        ? STARTUP_UPDATE_CHECK_TIMEOUT_MS
        : MANUAL_UPDATE_CHECK_TIMEOUT_MS
      const update = await service.checkForUpdate(timeoutMs)

      if (!update) {
        appUpdateStore.setUpToDate()
        return
      }

      appUpdateStore.setAvailableUpdate(update)
      if (isManualCheck || !appUpdateStore.isAvailableUpdateSkipped) {
        toastApi.updateAvailable(update, createToastActions())
      }
      return update
    } catch (error) {
      const message = toErrorMessage(error, [CHECK_UPDATE_FAILED_MESSAGE])
      appUpdateStore.setError('check-failed', message)
      logger.error(toCheckErrorLogMessage(message))
      return
    }
  }

  function showManualCheckResult(update: AppUpdateInfo | undefined): void {
    if (update) {
      return
    }

    if (appUpdateStore.lastError?.stage === 'check-failed') {
      toastApi.checkFailed({
        onViewReleasePage: openReleasePage,
      })
      return
    }

    toastApi.checkUpToDate()
  }

  async function runUpdateAction(): Promise<void> {
    const update = appUpdateStore.availableUpdate
    if (!update) {
      return
    }
    if (appUpdateStore.isDownloaded) {
      await installDownloadedUpdate()
      return
    }
    if (appUpdateStore.isInstalled) {
      await restartApp()
      return
    }
    if (appUpdateStore.isUpdating || appUpdateStore.isRestarting) {
      return
    }

    appUpdateStore.setUpdating()
    toastApi.updateStarted()
    let lastProgressToastKey: string | undefined
    try {
      await service.downloadUpdate((progress) => {
        appUpdateStore.updateDownloadProgress(progress)
        const progressToastKey = getDownloadProgressToastKey(progress)
        if (progressToastKey === lastProgressToastKey) {
          return
        }

        lastProgressToastKey = progressToastKey
        toastApi.updateProgress(progress)
      })
      appUpdateStore.setDownloaded()
      toastApi.updateDownloaded(createToastActions())
      if (hasInstallBlockers()) {
        toastApi.installBlocked()
      }
    } catch (error) {
      handleUpdateError(error)
    }
  }

  async function installDownloadedUpdate(): Promise<void> {
    if (hasInstallBlockers()) {
      toastApi.updateDownloaded(createToastActions())
      toastApi.installBlocked()
      return
    }

    try {
      toastApi.updateInstalling()
      await service.installUpdate()
      appUpdateStore.setInstalled()
    } catch (error) {
      handleUpdateError(error, 'downloaded')
      return
    }

    await restartApp()
  }

  async function restartApp(): Promise<void> {
    if (hasInstallBlockers()) {
      toastApi.restartBlocked()
      return
    }

    appUpdateStore.setRestarting()
    try {
      await service.restartApp()
    } catch (error) {
      const message = toErrorMessage(error)
      appUpdateStore.setError('restart-failed', message, 'installed')
      logger.error(`重启应用以完成更新失败: ${message}`)
      toastApi.restartFailed()
    }
  }

  function skipAvailableVersion(): void {
    appUpdateStore.skipAvailableVersion()
  }

  return {
    checkForUpdate,
    runUpdateAction,
    restartApp,
    openUpdateDetails,
    skipAvailableVersion,
    openReleasePage,
  }
}

export function useAppUpdateController() {
  const appUpdateStore = useAppUpdateStore()
  const modalStore = useModalStore()
  const { t } = useI18n()

  return createAppUpdateController({
    appUpdateStore,
    hasInstallBlockers: hasUpdateInstallBlockers,
    modalStore,
    service: appUpdateService,
    toastApi: createDefaultToastApi(t),
  })
}
