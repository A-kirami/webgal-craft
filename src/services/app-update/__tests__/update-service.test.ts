import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DownloadEvent } from '@tauri-apps/plugin-updater'

const {
  checkMock,
  closeMock,
  downloadAndInstallMock,
  downloadMock,
  installMock,
  openUrlMock,
  relaunchMock,
} = vi.hoisted(() => ({
  checkMock: vi.fn(),
  closeMock: vi.fn(),
  downloadAndInstallMock: vi.fn(),
  downloadMock: vi.fn(),
  installMock: vi.fn(),
  openUrlMock: vi.fn(),
  relaunchMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: checkMock,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: openUrlMock,
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: relaunchMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: vi.fn(),
}))

interface UpdateMockOptions {
  close?: ReturnType<typeof vi.fn>
  version?: string
}

function createUpdateMock(options: UpdateMockOptions = {}) {
  return {
    body: 'changes',
    close: options.close ?? closeMock,
    currentVersion: '1.0.0',
    date: '2026-06-05',
    download: downloadMock,
    downloadAndInstall: downloadAndInstallMock,
    install: installMock,
    version: options.version ?? '1.1.0',
  }
}

async function importService() {
  vi.resetModules()
  return import('~/services/app-update/update-service')
}

describe('appUpdateService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('下载更新时只调用 download，不触发 install 或 downloadAndInstall', async () => {
    const update = createUpdateMock()
    checkMock.mockResolvedValue(update)
    downloadMock.mockImplementation(async (onEvent?: (event: DownloadEvent) => void) => {
      onEvent?.({ event: 'Started', data: { contentLength: 100 } })
      onEvent?.({ event: 'Progress', data: { chunkLength: 100 } })
      onEvent?.({ event: 'Finished' })
    })
    const { appUpdateService } = await importService()
    const onProgress = vi.fn()

    await appUpdateService.checkForUpdate()
    await appUpdateService.downloadUpdate(onProgress)

    expect(downloadMock).toHaveBeenCalledTimes(1)
    expect(downloadAndInstallMock).not.toHaveBeenCalled()
    expect(installMock).not.toHaveBeenCalled()
    expect(onProgress).toHaveBeenLastCalledWith({
      downloadedBytes: 100,
      totalBytes: 100,
    })
  })

  it('安装更新时只调用已下载更新的 install', async () => {
    const update = createUpdateMock()
    checkMock.mockResolvedValue(update)
    const { appUpdateService } = await importService()

    await appUpdateService.checkForUpdate()
    await appUpdateService.installUpdate()

    expect(installMock).toHaveBeenCalledTimes(1)
    expect(closeMock).toHaveBeenCalledTimes(1)
    expect(downloadMock).not.toHaveBeenCalled()
    expect(downloadAndInstallMock).not.toHaveBeenCalled()
  })

  it('重复检查同版本更新时会关闭旧更新句柄', async () => {
    const firstCloseMock = vi.fn()
    const secondCloseMock = vi.fn()
    checkMock
      .mockResolvedValueOnce(createUpdateMock({ close: firstCloseMock }))
      .mockResolvedValueOnce(createUpdateMock({ close: secondCloseMock }))
    const { appUpdateService } = await importService()

    await appUpdateService.checkForUpdate()
    await appUpdateService.checkForUpdate()

    expect(firstCloseMock).toHaveBeenCalledTimes(1)
    expect(secondCloseMock).not.toHaveBeenCalled()
  })

  it('打开指定版本发布页时跳转到对应 GitHub release tag', async () => {
    const { appUpdateService } = await importService()

    await appUpdateService.openReleasePage('1.1.0')

    expect(openUrlMock).toHaveBeenCalledWith('https://github.com/A-kirami/webgal-craft/releases/tag/v1.1.0')
  })
})
