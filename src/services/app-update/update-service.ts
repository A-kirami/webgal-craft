import { openUrl } from '@tauri-apps/plugin-opener'
import { relaunch } from '@tauri-apps/plugin-process'

import { isDesktopRuntime } from '~/services/platform/runtime'

import type { Update } from '@tauri-apps/plugin-updater'

import { github } from '~build/git'

export interface AppUpdateInfo {
  version: string
  currentVersion: string
  date?: string
  body?: string
}

export interface UpdateDownloadProgress {
  downloadedBytes: number
  totalBytes?: number
}

export interface AppUpdateService {
  checkForUpdate(timeoutMs?: number): Promise<AppUpdateInfo | undefined>
  downloadUpdate(onProgress: (progress: UpdateDownloadProgress) => void): Promise<void>
  installUpdate(): Promise<void>
  openReleasePage(version?: string): Promise<void>
  restartApp(): Promise<void>
}

let pendingUpdate: Update | undefined

function toAppUpdateInfo(update: Update): AppUpdateInfo {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    date: update.date,
    body: update.body,
  }
}

async function closePendingUpdate(): Promise<void> {
  const update = pendingUpdate
  pendingUpdate = undefined

  if (!update) {
    return
  }

  await Promise.resolve(update.close()).catch((error) => {
    logger.warn(`关闭旧更新句柄失败: ${error}`)
  })
}

async function checkForUpdate(timeoutMs?: number): Promise<AppUpdateInfo | undefined> {
  if (!isDesktopRuntime()) {
    return
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check({ timeout: timeoutMs })

    if (!update) {
      await closePendingUpdate()
      return
    }

    if (pendingUpdate && pendingUpdate !== update) {
      await closePendingUpdate()
    }

    pendingUpdate = update
    return toAppUpdateInfo(update)
  } catch (error) {
    throw new Error('检查更新失败', { cause: error })
  }
}

async function downloadUpdate(onProgress: (progress: UpdateDownloadProgress) => void): Promise<void> {
  if (!pendingUpdate) {
    throw new Error('没有可下载的更新')
  }

  let downloadedBytes = 0
  let totalBytes: number | undefined

  try {
    await pendingUpdate.download((event) => {
      switch (event.event) {
        case 'Started': {
          downloadedBytes = 0
          totalBytes = event.data.contentLength
          onProgress({ downloadedBytes, totalBytes })
          return
        }
        case 'Progress': {
          downloadedBytes += event.data.chunkLength
          onProgress({ downloadedBytes, totalBytes })
          return
        }
        case 'Finished': {
          onProgress({
            downloadedBytes: totalBytes ?? downloadedBytes,
            totalBytes,
          })
          return
        }
        default: {
          event satisfies never
        }
      }
    })
  } catch (error) {
    throw new Error('下载更新失败', { cause: error })
  }
}

async function installUpdate(): Promise<void> {
  if (!pendingUpdate) {
    throw new Error('没有可安装的更新')
  }

  try {
    await pendingUpdate.install()
    await closePendingUpdate()
  } catch (error) {
    throw new Error('安装更新失败', { cause: error })
  }
}

async function restartApp(): Promise<void> {
  try {
    await relaunch()
  } catch (error) {
    throw new Error('重启应用失败', { cause: error })
  }
}

function getReleasePageUrl(version?: string): string {
  const releaseListUrl = github ? `${github}/releases` : 'https://github.com/A-kirami/webgal-craft/releases'
  if (!version) {
    return releaseListUrl
  }

  const tagName = version.startsWith('v') ? version : `v${version}`
  return `${releaseListUrl}/tag/${encodeURIComponent(tagName)}`
}

async function openReleasePage(version?: string): Promise<void> {
  await openUrl(getReleasePageUrl(version))
}

export const appUpdateService: AppUpdateService = {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  openReleasePage,
  restartApp,
}
