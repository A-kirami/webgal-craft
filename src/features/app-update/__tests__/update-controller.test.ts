import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppUpdateController } from '~/features/app-update/useAppUpdateController'
import { useAppUpdateStore } from '~/stores/app-update'

import type { AppUpdateService } from '~/services/app-update/update-service'

const { loggerErrorMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: loggerErrorMock,
}))

function createServiceMock(): AppUpdateService {
  return {
    checkForUpdate: vi.fn(),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
    openReleasePage: vi.fn(),
    restartApp: vi.fn(),
  }
}

interface ControllerHarnessOptions {
  hasInstallBlockers?: () => boolean
}

function createControllerHarness(options: ControllerHarnessOptions = {}) {
  const store = useAppUpdateStore()
  const service = createServiceMock()
  const modalOpen = vi.fn()
  const toastApi = {
    checkFailed: vi.fn(),
    checkStarted: vi.fn(),
    checkUpToDate: vi.fn(),
    updateAvailable: vi.fn(),
    updateDownloaded: vi.fn(),
    updateInstalling: vi.fn(),
    updateStarted: vi.fn(),
    updateProgress: vi.fn(),
    updateFailed: vi.fn(),
    installBlocked: vi.fn(),
    restartBlocked: vi.fn(),
    restartFailed: vi.fn(),
  }
  const controller = createAppUpdateController({
    appUpdateStore: store,
    hasInstallBlockers: options.hasInstallBlockers ?? vi.fn(() => false),
    modalStore: { open: modalOpen },
    service,
    toastApi,
  })

  return {
    controller,
    modalOpen,
    service,
    store,
    toastApi,
  }
}

describe('createAppUpdateController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('启动检查失败只记录错误状态，不弹 toast', async () => {
    const { controller, service, toastApi, store } = createControllerHarness()
    vi.mocked(service.checkForUpdate).mockRejectedValue(new Error('network down'))

    await controller.checkForUpdate('startup')

    expect(store.status).toBe('error')
    expect(store.lastError?.stage).toBe('check-failed')
    expect(toastApi.checkFailed).not.toHaveBeenCalled()
    expect(toastApi.updateAvailable).not.toHaveBeenCalled()
  })

  it('启动检查发现未跳过版本时弹出更新 toast', async () => {
    const { controller, service, toastApi, store } = createControllerHarness()
    vi.mocked(service.checkForUpdate).mockResolvedValue({
      currentVersion: '1.0.0',
      version: '1.1.0',
    })

    await controller.checkForUpdate('startup')

    expect(store.status).toBe('available')
    expect(toastApi.updateAvailable).toHaveBeenCalledWith(
      expect.objectContaining({ version: '1.1.0' }),
      expect.objectContaining({
        onUpdateNow: expect.any(Function),
        onViewUpdate: expect.any(Function),
      }),
    )
  })

  it('启动检查发现已跳过版本时不弹 toast', async () => {
    const { controller, service, toastApi, store } = createControllerHarness()
    store.skipVersion('1.1.0')
    vi.mocked(service.checkForUpdate).mockResolvedValue({
      currentVersion: '1.0.0',
      version: '1.1.0',
    })

    await controller.checkForUpdate('startup')

    expect(store.status).toBe('available')
    expect(store.isAvailableUpdateSkipped).toBe(true)
    expect(toastApi.updateAvailable).not.toHaveBeenCalled()
  })

  it('启动检查尚未结束时手动点击会让当前启动检查变为可见', async () => {
    const startupHarness = createControllerHarness()
    const manualHarness = createControllerHarness()
    let resolveStartupCheck!: (update: undefined) => void
    vi.mocked(startupHarness.service.checkForUpdate).mockImplementation(() => new Promise((resolve) => {
      resolveStartupCheck = resolve
    }))

    const startupCheck = startupHarness.controller.checkForUpdate('startup')
    const manualCheck = manualHarness.controller.checkForUpdate('manual')

    expect(manualHarness.toastApi.checkStarted).toHaveBeenCalledWith()
    expect(startupHarness.service.checkForUpdate).toHaveBeenCalledTimes(1)
    expect(manualHarness.service.checkForUpdate).not.toHaveBeenCalled()

    resolveStartupCheck(undefined)
    await Promise.all([startupCheck, manualCheck])

    expect(startupHarness.toastApi.checkUpToDate).toHaveBeenCalledWith()
    expect(manualHarness.toastApi.checkUpToDate).not.toHaveBeenCalled()
  })

  it('启动检查发现更新时手动点击不会重复展示更新提示', async () => {
    const startupHarness = createControllerHarness()
    const manualHarness = createControllerHarness()
    let resolveStartupCheck!: (update: { currentVersion: string, version: string }) => void
    vi.mocked(startupHarness.service.checkForUpdate).mockImplementation(() => new Promise((resolve) => {
      resolveStartupCheck = resolve
    }))

    const startupCheck = startupHarness.controller.checkForUpdate('startup')
    const manualCheck = manualHarness.controller.checkForUpdate('manual')

    resolveStartupCheck({
      currentVersion: '1.0.0',
      version: '1.1.0',
    })
    await Promise.all([startupCheck, manualCheck])

    expect(startupHarness.toastApi.updateAvailable).toHaveBeenCalledTimes(1)
    expect(manualHarness.toastApi.updateAvailable).not.toHaveBeenCalled()
  })

  it('手动检查发现已跳过版本时仍展示更新 toast', async () => {
    const { controller, service, toastApi, store } = createControllerHarness()
    store.skipVersion('1.1.0')
    vi.mocked(service.checkForUpdate).mockResolvedValue({
      currentVersion: '1.0.0',
      version: '1.1.0',
    })

    const result = await controller.checkForUpdate('manual')

    expect(result?.version).toBe('1.1.0')
    expect(store.availableUpdate?.version).toBe('1.1.0')
    expect(toastApi.checkStarted).toHaveBeenCalledWith()
    expect(toastApi.updateAvailable).toHaveBeenCalledWith(
      expect.objectContaining({ version: '1.1.0' }),
      expect.objectContaining({
        onUpdateNow: expect.any(Function),
        onViewUpdate: expect.any(Function),
      }),
    )
  })

  it('手动检查没有更新时用同一个 toast 提示已是最新版本', async () => {
    const { controller, service, store, toastApi } = createControllerHarness()
    vi.mocked(service.checkForUpdate).mockResolvedValue(undefined)

    await controller.checkForUpdate('manual')

    expect(store.status).toBe('up-to-date')
    expect(toastApi.checkStarted).toHaveBeenCalledWith()
    expect(toastApi.checkUpToDate).toHaveBeenCalledWith()
    expect(toastApi.updateAvailable).not.toHaveBeenCalled()
  })

  it('手动检查失败时用同一个 toast 展示失败状态', async () => {
    const { controller, service, store, toastApi } = createControllerHarness()
    vi.mocked(service.checkForUpdate).mockRejectedValue(new Error('network down'))

    await controller.checkForUpdate('manual')

    expect(store.status).toBe('error')
    expect(store.lastError?.stage).toBe('check-failed')
    expect(toastApi.checkStarted).toHaveBeenCalledWith()
    expect(toastApi.checkFailed).toHaveBeenCalledWith(expect.objectContaining({
      onViewReleasePage: expect.any(Function),
    }))
  })

  it('打开发布页失败时会记录错误', async () => {
    const { controller, service } = createControllerHarness()
    vi.mocked(service.openReleasePage).mockRejectedValue(new Error('open failed'))

    await controller.openReleasePage('1.1.0')

    expect(service.openReleasePage).toHaveBeenCalledWith('1.1.0')
    expect(loggerErrorMock).toHaveBeenCalledWith('打开应用发布页失败: open failed')
  })

  it('检查失败时会记录底层错误原因而不是通用包装信息', async () => {
    const { controller, service, store } = createControllerHarness()
    vi.mocked(service.checkForUpdate).mockRejectedValue(
      new Error('检查更新失败', { cause: new Error('网络连接失败') }),
    )

    await controller.checkForUpdate('startup')

    expect(store.lastError?.message).toBe('网络连接失败')
    expect(loggerErrorMock).toHaveBeenCalledWith('检查应用更新失败: 网络连接失败')
  })

  it('下载完成且无阻塞项时只提示安装更新', async () => {
    const { controller, service, store, toastApi } = createControllerHarness()
    store.setAvailableUpdate({
      currentVersion: '1.0.0',
      version: '1.1.0',
    })
    vi.mocked(service.downloadUpdate).mockImplementation(async (onProgress) => {
      onProgress({ downloadedBytes: 10, totalBytes: 20 })
    })

    await controller.runUpdateAction()

    expect(toastApi.updateStarted).toHaveBeenCalledWith()
    expect(service.installUpdate).not.toHaveBeenCalled()
    expect(service.restartApp).not.toHaveBeenCalled()
    expect(toastApi.updateInstalling).not.toHaveBeenCalled()
    expect(store.status).toBe('downloaded')
    expect(store.downloadProgress).toEqual({ downloadedBytes: 10, totalBytes: 20 })
    expect(toastApi.updateDownloaded).toHaveBeenCalledWith(expect.objectContaining({
      onUpdateNow: expect.any(Function),
      onViewUpdate: expect.any(Function),
    }))
  })

  it('已下载更新时再次触发更新会安装并尝试重新启动应用', async () => {
    const { controller, service, store, toastApi } = createControllerHarness()
    store.setAvailableUpdate({
      currentVersion: '1.0.0',
      version: '1.1.0',
    })
    store.setDownloaded()

    await controller.runUpdateAction()

    expect(service.downloadUpdate).not.toHaveBeenCalled()
    expect(toastApi.updateInstalling).toHaveBeenCalledWith()
    expect(service.installUpdate).toHaveBeenCalledTimes(1)
    expect(service.restartApp).toHaveBeenCalledTimes(1)
    expect(store.status).toBe('restarting')
  })

  it('已有下载更新时手动检查不会显示检查中的空反馈', async () => {
    const { controller, service, store, toastApi } = createControllerHarness()
    const update = {
      currentVersion: '1.0.0',
      version: '1.1.0',
    }
    store.setAvailableUpdate(update)
    store.setDownloaded()

    const result = await controller.checkForUpdate('manual')

    expect(result).toEqual(update)
    expect(service.checkForUpdate).not.toHaveBeenCalled()
    expect(toastApi.checkStarted).not.toHaveBeenCalled()
    expect(toastApi.checkUpToDate).not.toHaveBeenCalled()
    expect(toastApi.updateAvailable).not.toHaveBeenCalled()
  })

  it('下载完成但存在阻塞项时不安装更新', async () => {
    const { controller, service, store, toastApi } = createControllerHarness({
      hasInstallBlockers: vi.fn(() => true),
    })
    store.setAvailableUpdate({
      currentVersion: '1.0.0',
      version: '1.1.0',
    })
    vi.mocked(service.downloadUpdate).mockImplementation(async (onProgress) => {
      onProgress({ downloadedBytes: 20, totalBytes: 20 })
    })

    await controller.runUpdateAction()

    expect(service.installUpdate).not.toHaveBeenCalled()
    expect(store.status).toBe('downloaded')
    expect(toastApi.updateDownloaded).toHaveBeenCalledWith(expect.objectContaining({
      onUpdateNow: expect.any(Function),
      onViewUpdate: expect.any(Function),
    }))
    expect(toastApi.installBlocked).toHaveBeenCalledTimes(1)
  })

  it('下载失败时会用同一个更新 toast 展示失败状态', async () => {
    const { controller, service, store, toastApi } = createControllerHarness()
    store.setAvailableUpdate({
      currentVersion: '1.0.0',
      version: '1.1.0',
    })
    vi.mocked(service.downloadUpdate).mockImplementation(async (onProgress) => {
      onProgress({ downloadedBytes: 10, totalBytes: 100 })
      throw new Error('download failed')
    })

    await controller.runUpdateAction()

    expect(toastApi.updateFailed).toHaveBeenCalledWith(expect.objectContaining({
      onUpdateNow: expect.any(Function),
      onViewUpdate: expect.any(Function),
    }))
  })

  it('下载进度变化时会更新 loading toast', async () => {
    const { controller, service, store, toastApi } = createControllerHarness()
    store.setAvailableUpdate({
      currentVersion: '1.0.0',
      version: '1.1.0',
    })
    vi.mocked(service.downloadUpdate).mockImplementation(async (onProgress) => {
      onProgress({ downloadedBytes: 10, totalBytes: 100 })
      onProgress({ downloadedBytes: 10, totalBytes: 100 })
      onProgress({ downloadedBytes: 20, totalBytes: 100 })
      onProgress({ downloadedBytes: 100, totalBytes: 100 })
    })

    await controller.runUpdateAction()

    expect(toastApi.updateProgress).toHaveBeenCalledTimes(3)
    expect(toastApi.updateProgress).toHaveBeenNthCalledWith(1, {
      downloadedBytes: 10,
      totalBytes: 100,
    })
    expect(toastApi.updateProgress).toHaveBeenNthCalledWith(2, {
      downloadedBytes: 20,
      totalBytes: 100,
    })
    expect(toastApi.updateProgress).toHaveBeenNthCalledWith(3, {
      downloadedBytes: 100,
      totalBytes: 100,
    })
  })

  it('存在阻塞项时提示暂不能重启', async () => {
    const { controller, service, store, toastApi } = createControllerHarness({
      hasInstallBlockers: vi.fn(() => true),
    })

    await controller.restartApp()

    expect(service.restartApp).not.toHaveBeenCalled()
    expect(store.status).not.toBe('restarting')
    expect(toastApi.restartBlocked).toHaveBeenCalledTimes(1)
  })

  it('无阻塞项时会进入重启状态并调用重启服务', async () => {
    const { controller, service, store, toastApi } = createControllerHarness()
    store.setAvailableUpdate({
      currentVersion: '1.0.0',
      version: '1.1.0',
    })
    store.setInstalled()

    await controller.restartApp()

    expect(service.restartApp).toHaveBeenCalledTimes(1)
    expect(store.status).toBe('restarting')
    expect(toastApi.restartBlocked).not.toHaveBeenCalled()
  })
})
