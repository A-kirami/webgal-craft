import type { ExternalToast } from 'vue-sonner'
import type { AppUpdateInfo, UpdateDownloadProgress } from '~/services/app-update/update-service'

type AppUpdateTranslate = (key: string, params?: Record<string, unknown>) => string

export interface AppUpdateToastActions {
  onUpdateNow: () => void
  onViewUpdate: () => void
}

export interface AppUpdateCheckFailedToastActions {
  onViewReleasePage: () => void
}

export interface AppUpdateToastApi {
  checkStarted(): void
  checkUpToDate(): void
  checkFailed(actions: AppUpdateCheckFailedToastActions): void
  updateAvailable(info: AppUpdateInfo, actions: AppUpdateToastActions): void
  updateStarted(): void
  updateProgress(progress: UpdateDownloadProgress): void
  updateDownloaded(actions: AppUpdateToastActions): void
  updateInstalling(): void
  updateFailed(actions: AppUpdateToastActions): void
  installBlocked(): void
  restartBlocked(): void
  restartFailed(): void
}

const APP_UPDATE_TOAST_ID = 'app-update'
const SHORT_TOAST_DURATION_MS = 4 * 1000
const ACTION_TOAST_DURATION_MS = 12 * 1000
const PINNED_TOAST_DURATION = Infinity
const APP_UPDATE_TOAST_STYLE = {
  // Sonner 会复用同 id toast 的缓存高度；设置为 auto 避免按钮变化后内容被裁切。
  '--initial-height': 'auto',
}
// 同 id toast 会复用上一条 toast 的字段；显式 undefined 用来清空旧描述和按钮。
const REUSED_TOAST_RESET_OPTIONS = {
  action: undefined,
  cancel: undefined,
  description: undefined,
}

interface AppUpdateToastOptions {
  action?: ExternalToast['action']
  cancel?: ExternalToast['cancel']
  description?: ExternalToast['description']
  duration?: ExternalToast['duration']
}

function createUpdateToastOptions(options: AppUpdateToastOptions = {}): ExternalToast {
  return {
    id: APP_UPDATE_TOAST_ID,
    style: APP_UPDATE_TOAST_STYLE,
    ...REUSED_TOAST_RESET_OPTIONS,
    ...options,
  }
}

function getDownloadProgressPercent(progress: UpdateDownloadProgress): number | undefined {
  const { downloadedBytes, totalBytes } = progress
  if (totalBytes === undefined || totalBytes <= 0) {
    return
  }

  const percent = Math.floor((downloadedBytes / totalBytes) * 100)
  return Math.min(Math.max(percent, 0), 100)
}

function isDownloadFinished(progress: UpdateDownloadProgress): boolean {
  const { downloadedBytes, totalBytes } = progress
  return totalBytes !== undefined && totalBytes > 0 && downloadedBytes >= totalBytes
}

export function getDownloadProgressToastKey(progress: UpdateDownloadProgress): string {
  if (isDownloadFinished(progress)) {
    return 'downloaded'
  }

  const percent = getDownloadProgressPercent(progress)
  return percent === undefined ? 'downloading' : `downloading:${percent}`
}

function keepToastOpenAfterClick(action: () => void): (event: MouseEvent) => void {
  return (event) => {
    event.preventDefault()
    action()
  }
}

function getDownloadProgressDescription(
  t: AppUpdateTranslate,
  progress: UpdateDownloadProgress,
): string {
  const percent = getDownloadProgressPercent(progress)
  if (percent === undefined) {
    return t('appUpdate.toast.updateDownloadingDescription')
  }

  return t('appUpdate.toast.updateDownloadingProgressDescription', { percent })
}

export function createDefaultToastApi(t: AppUpdateTranslate): AppUpdateToastApi {
  return {
    checkStarted() {
      return toast.loading(
        t('appUpdate.toast.checkStartedTitle'),
        createUpdateToastOptions({
          duration: PINNED_TOAST_DURATION,
        }),
      )
    },
    checkUpToDate() {
      toast.success(
        t('appUpdate.toast.checkUpToDateTitle'),
        createUpdateToastOptions({
          description: t('appUpdate.toast.checkUpToDateDescription'),
          duration: SHORT_TOAST_DURATION_MS,
        }),
      )
    },
    checkFailed(actions) {
      toast.error(
        t('appUpdate.error.checkFailed'),
        createUpdateToastOptions({
          description: t('appUpdate.toast.checkFailedDescription'),
          duration: ACTION_TOAST_DURATION_MS,
          action: {
            label: t('appUpdate.toast.openReleasePage'),
            onClick: actions.onViewReleasePage,
          },
        }),
      )
    },
    updateAvailable(info, actions) {
      toast.info(
        t('appUpdate.toast.availableTitle', { version: info.version }),
        createUpdateToastOptions({
          description: t('appUpdate.toast.availableDescription', {
            currentVersion: info.currentVersion,
            version: info.version,
          }),
          duration: ACTION_TOAST_DURATION_MS,
          action: {
            label: t('appUpdate.toast.updateNow'),
            onClick: keepToastOpenAfterClick(actions.onUpdateNow),
          },
          cancel: {
            label: t('appUpdate.toast.viewUpdate'),
            onClick: actions.onViewUpdate,
          },
        }),
      )
    },
    updateStarted() {
      return toast.loading(
        t('appUpdate.toast.updateStartedProgressTitle'),
        createUpdateToastOptions({
          description: t('appUpdate.toast.updateStartedDescription'),
          duration: PINNED_TOAST_DURATION,
        }),
      )
    },
    updateProgress(progress) {
      toast.loading(
        t('appUpdate.toast.updateStartedProgressTitle'),
        createUpdateToastOptions({
          description: getDownloadProgressDescription(t, progress),
          duration: PINNED_TOAST_DURATION,
        }),
      )
    },
    updateDownloaded(actions) {
      toast.info(
        t('appUpdate.toast.downloadedTitle'),
        createUpdateToastOptions({
          description: t('appUpdate.toast.downloadedDescription'),
          duration: PINNED_TOAST_DURATION,
          action: {
            label: t('appUpdate.toast.installUpdateNow'),
            onClick: keepToastOpenAfterClick(actions.onUpdateNow),
          },
        }),
      )
    },
    updateInstalling() {
      toast.loading(
        t('appUpdate.toast.updateInstallingTitle'),
        createUpdateToastOptions({
          description: t('appUpdate.toast.updateInstallingDescription'),
          duration: PINNED_TOAST_DURATION,
        }),
      )
    },
    updateFailed(actions) {
      toast.error(
        t('appUpdate.error.updateFailed'),
        createUpdateToastOptions({
          duration: PINNED_TOAST_DURATION,
          action: {
            label: t('appUpdate.toast.retry'),
            onClick: keepToastOpenAfterClick(actions.onUpdateNow),
          },
        }),
      )
    },
    installBlocked() {
      toast.warning(t('appUpdate.toast.installBlockedTitle'), {
        description: t('appUpdate.toast.installBlockedDescription'),
      })
    },
    restartBlocked() {
      toast.warning(t('appUpdate.toast.restartBlockedTitle'), {
        description: t('appUpdate.toast.restartBlockedDescription'),
      })
    },
    restartFailed() {
      toast.error(
        t('appUpdate.error.restartFailed'),
        createUpdateToastOptions({
          duration: ACTION_TOAST_DURATION_MS,
        }),
      )
    },
  }
}
