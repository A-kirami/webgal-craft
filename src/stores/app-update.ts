import { defineStore } from 'pinia'

import type { AppUpdateInfo, UpdateDownloadProgress } from '~/services/app-update/update-service'

export type AppUpdateErrorStage = 'check-failed' | 'update-failed' | 'restart-failed'

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'updating'
  | 'downloaded'
  | 'installed'
  | 'restarting'
  | 'error'

export interface AppUpdateErrorState {
  stage: AppUpdateErrorStage
  message: string
}

export const useAppUpdateStore = defineStore(
  'app-update',
  () => {
    let status = $ref<AppUpdateStatus>('idle')
    let availableUpdate = $ref<AppUpdateInfo>()
    let skippedVersion = $ref<string>()
    let lastCheckedAt = $ref<number>()
    let lastError = $ref<AppUpdateErrorState>()
    let downloadProgress = $ref<UpdateDownloadProgress>()

    const isChecking = $computed(() => status === 'checking')
    const isUpdating = $computed(() => status === 'updating')
    const isDownloaded = $computed(() => status === 'downloaded')
    const isInstalled = $computed(() => status === 'installed')
    const isRestarting = $computed(() => status === 'restarting')
    const isAvailableUpdateSkipped = $computed(() =>
      availableUpdate !== undefined && skippedVersion === availableUpdate.version,
    )

    function setChecking(): void {
      status = 'checking'
      lastError = undefined
      downloadProgress = undefined
    }

    function setUpToDate(): void {
      status = 'up-to-date'
      availableUpdate = undefined
      lastCheckedAt = Date.now()
      lastError = undefined
      downloadProgress = undefined
    }

    function setAvailableUpdate(update: AppUpdateInfo): void {
      availableUpdate = update
      status = 'available'
      lastCheckedAt = Date.now()
      lastError = undefined
      downloadProgress = undefined

      if (skippedVersion && skippedVersion !== update.version) {
        skippedVersion = undefined
      }
    }

    function skipVersion(version: string): void {
      skippedVersion = version
    }

    function skipAvailableVersion(): void {
      if (availableUpdate) {
        skipVersion(availableUpdate.version)
      }
    }

    function setUpdating(): void {
      if (!availableUpdate) {
        return
      }
      status = 'updating'
      lastError = undefined
      downloadProgress = { downloadedBytes: 0 }
    }

    function updateDownloadProgress(progress: UpdateDownloadProgress): void {
      downloadProgress = progress
    }

    function setDownloaded(): void {
      if (!availableUpdate) {
        return
      }
      status = 'downloaded'
      lastError = undefined
    }

    function setInstalled(): void {
      if (!availableUpdate) {
        return
      }
      status = 'installed'
      lastError = undefined
    }

    function setRestarting(): void {
      status = 'restarting'
      lastError = undefined
    }

    function setError(
      stage: AppUpdateErrorStage,
      message: string,
      nextStatus: AppUpdateStatus = 'error',
    ): void {
      status = nextStatus
      lastError = { stage, message }
    }

    return $$({
      status,
      availableUpdate,
      skippedVersion,
      lastCheckedAt,
      lastError,
      downloadProgress,
      isChecking,
      isUpdating,
      isDownloaded,
      isInstalled,
      isRestarting,
      isAvailableUpdateSkipped,
      setChecking,
      setUpToDate,
      setAvailableUpdate,
      skipVersion,
      skipAvailableVersion,
      setUpdating,
      updateDownloadProgress,
      setDownloaded,
      setInstalled,
      setRestarting,
      setError,
    })
  },
  {
    persist: {
      pick: ['skippedVersion'],
    },
  },
)
