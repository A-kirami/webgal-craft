import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine } from '~/__tests__/factories'
import { OFFICIAL_WEBGAL_ENGINE_ID, OFFICIAL_WEBGAL_ENGINE_NAME } from '~/domain/engine/official-release'
import { MIN_WEBGAL_EDITOR_RUNTIME_VERSION } from '~/domain/engine/runtime-capabilities'
import { AbsPath } from '~/domain/path'
import { useOfficialEngineReleaseCacheStore } from '~/stores/official-engine-release-cache'
import { AppError } from '~/types/errors'

import { useEnginesTabController } from '../useEnginesTabController'

const {
  enginesWhereMock,
  importEngineMock,
  toastErrorMock,
  toastSuccessMock,
  openDialogMock,
  openPathMock,
  openUrlMock,
  reconcileEngineRecordMock,
  getOfficialEngineReleasesMock,
  getLatestOfficialEngineReleaseMock,
  installOfficialEngineMock,
} = vi.hoisted(() => ({
  enginesWhereMock: vi.fn(),
  importEngineMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  openDialogMock: vi.fn(),
  openPathMock: vi.fn(),
  openUrlMock: vi.fn(),
  reconcileEngineRecordMock: vi.fn(),
  getOfficialEngineReleasesMock: vi.fn(),
  getLatestOfficialEngineReleaseMock: vi.fn(),
  installOfficialEngineMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: openPathMock,
  openUrl: openUrlMock,
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

vi.mock('~/services/engine-manager', () => {
  return {
    engineManager: {
      importEngine: importEngineMock,
      getLatestOfficialEngineRelease: getLatestOfficialEngineReleaseMock,
      getOfficialEngineReleases: getOfficialEngineReleasesMock,
      installOfficialEngine: installOfficialEngineMock,
    },
  }
})

vi.mock('~/services/resource-reconcile', () => ({
  resourceReconcile: {
    reconcileEngineRecord: reconcileEngineRecordMock,
  },
}))

vi.mock('~/database/db', () => ({
  db: {
    engines: {
      where: enginesWhereMock,
    },
  },
}))

describe('useEnginesTabController', () => {
  const openDeleteEngineGroupModalMock = vi.fn()
  const openDeleteEngineModalMock = vi.fn()
  const setDefaultEngineIdMock = vi.fn()

  function createController(overrides?: Partial<Parameters<typeof useEnginesTabController>[0]>) {
    return useEnginesTabController({
      activeProgress: new Map<string, number>(),
      android: false,
      openDeleteEngineGroupModal: openDeleteEngineGroupModalMock,
      openDeleteEngineModal: openDeleteEngineModalMock,
      setDefaultEngineId: setDefaultEngineIdMock,
      t: (key: string) => key,
      ...overrides,
    })
  }

  function createOfficialRelease(version: string) {
    return {
      assetName: `WebGAL-${version}-web.zip`,
      assetUrl: `https://example.com/${version}.zip`,
      engineId: OFFICIAL_WEBGAL_ENGINE_ID,
      name: OFFICIAL_WEBGAL_ENGINE_NAME,
      releaseUrl: `https://example.com/releases/${version}`,
      sha256: 'a'.repeat(64),
      version,
    }
  }

  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())

    openDialogMock.mockResolvedValue(undefined)
    getOfficialEngineReleasesMock.mockResolvedValue([])
    getLatestOfficialEngineReleaseMock.mockResolvedValue(createOfficialRelease('4.6.4'))
    reconcileEngineRecordMock.mockResolvedValue('available')
    enginesWhereMock.mockReturnValue({
      equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    })
  })

  it('拖入多个目录时提示错误且不会触发导入', async () => {
    const controller = createController()

    await controller.handleDrop(['/a', '/b'])

    expect(importEngineMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith('home.engines.importMultipleFolders')
  })

  it('从选择对话框选中目录后导入引擎', async () => {
    openDialogMock.mockResolvedValue('/engines/selected')

    const controller = createController()

    await controller.selectEngineFolder()

    expect(importEngineMock).toHaveBeenCalledWith('/engines/selected')
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })

  it('导入结构错误时提示非法目录', async () => {
    importEngineMock.mockRejectedValue(new AppError('INVALID_STRUCTURE', 'invalid'))
    openDialogMock.mockResolvedValue('/engines/invalid')

    const controller = createController()

    await controller.selectEngineFolder()

    expect(toastErrorMock).toHaveBeenCalledWith('home.engines.importInvalidFolder')
  })

  it('导入过旧引擎时会把最低运行时版本传给通知文案', async () => {
    importEngineMock.mockRejectedValue(new AppError('ENGINE_EDITOR_INCOMPATIBLE', 'too old', {
      details: {
        issue: 'versionTooOld',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    }))
    openDialogMock.mockResolvedValue('/engines/old')
    const t = vi.fn((key: string, ...args: unknown[]) => {
      const named = args[0] as { version?: unknown } | undefined
      return `${key}:${String(named?.version ?? '')}`
    })

    const controller = createController({ t })

    await controller.selectEngineFolder()

    expect(toastErrorMock).toHaveBeenCalledWith(
      `home.engines.importVersionTooOld:${MIN_WEBGAL_EDITOR_RUNTIME_VERSION}`,
    )
  })

  it('打开引擎族目录时会跳到名称层目录', async () => {
    const controller = createController()

    await controller.handleOpenGroupFolder({
      engines: [
        {
          engine: createTestEngine({
            path: AbsPath.from('/engines/WebGAL/4.5.0'),
            version: '4.5.0',
          }),
        },
      ],
    })

    expect(openPathMock).toHaveBeenCalledWith('/engines/WebGAL')
  })

  it('会把默认引擎切换委托给调用方', () => {
    const controller = createController()

    controller.handleSetDefaultEngine('WebGAL')

    expect(setDefaultEngineIdMock).toHaveBeenCalledWith('WebGAL')
  })

  it('取消默认引擎时会把空值委托给调用方', () => {
    const controller = createController()

    controller.handleSetDefaultEngine(undefined)

    expect(setDefaultEngineIdMock).toHaveBeenCalledWith(undefined)
  })

  it('打开官方发布页时使用发布总览地址', async () => {
    const controller = createController()

    await controller.openOfficialRelease()

    expect(openUrlMock).toHaveBeenCalledWith('https://github.com/OpenWebGAL/WebGAL/releases')
  })

  it('打开指定版本时使用缓存的发布链接', async () => {
    const controller = createController()

    await controller.openOfficialVersionRelease('https://example.com/releases/4.6.4')

    expect(openUrlMock).toHaveBeenCalledWith('https://example.com/releases/4.6.4')
  })

  it('缓存最新标签未变化时不重新拉取完整版本列表', async () => {
    const cachedRelease = createOfficialRelease('4.6.4')
    useOfficialEngineReleaseCacheStore().replaceReleases([cachedRelease], cachedRelease.version)
    const controller = createController()

    await controller.loadOfficialEngineReleases()

    expect(getOfficialEngineReleasesMock).not.toHaveBeenCalled()
    expect(controller.officialReleases.value).toEqual([cachedRelease])
  })

  it('最新标签变化时会刷新完整版本列表和缓存', async () => {
    const cachedRelease = createOfficialRelease('4.6.4')
    const latestRelease = createOfficialRelease('4.6.5')
    useOfficialEngineReleaseCacheStore().replaceReleases([cachedRelease], cachedRelease.version)
    getLatestOfficialEngineReleaseMock.mockResolvedValue(latestRelease)
    getOfficialEngineReleasesMock.mockResolvedValue([latestRelease, cachedRelease])
    const controller = createController()

    await controller.loadOfficialEngineReleases()

    const cacheStore = useOfficialEngineReleaseCacheStore()
    expect(getOfficialEngineReleasesMock).toHaveBeenCalledOnce()
    expect(cacheStore.latestVersion).toBe('4.6.5')
    expect(controller.officialReleases.value.map(release => release.version)).toEqual(['4.6.5', '4.6.4'])
  })

  it('版本刷新完成时不会覆盖正在进行的安装状态', async () => {
    const cachedRelease = createOfficialRelease('4.6.4')
    useOfficialEngineReleaseCacheStore().replaceReleases([cachedRelease], cachedRelease.version)

    let resolveLatestRelease: ((release: ReturnType<typeof createOfficialRelease>) => void) | undefined
    const latestReleasePromise = new Promise<ReturnType<typeof createOfficialRelease>>((resolve) => {
      resolveLatestRelease = resolve
    })
    getLatestOfficialEngineReleaseMock.mockReturnValue(latestReleasePromise)

    const installResult = {
      alreadyRegistered: false,
      id: 'official-engine',
      release: cachedRelease,
    }
    let resolveInstall: ((result: typeof installResult) => void) | undefined
    const installPromise = new Promise<typeof installResult>((resolve) => {
      resolveInstall = resolve
    })
    installOfficialEngineMock.mockReturnValue(installPromise)

    const controller = createController()
    const refreshPromise = controller.loadOfficialEngineReleases()
    await vi.waitFor(() => expect(getLatestOfficialEngineReleaseMock).toHaveBeenCalledOnce())

    const installOperation = controller.installOfficialEngine('4.6.4')
    expect(controller.officialStatus.value).toBe('installing')

    resolveLatestRelease?.(cachedRelease)
    await refreshPromise
    expect(controller.officialStatus.value).toBe('installing')

    resolveInstall?.(installResult)
    await installOperation
    expect(controller.officialStatus.value).toBe('ready')
  })

  it('会用最新校验结果打开整组删除弹窗', async () => {
    const staleEngine = createTestEngine({
      id: 'engine-stale',
      availability: 'available',
    })
    const missingEngine = createTestEngine({
      id: 'engine-missing',
      availability: 'missing',
    })
    enginesWhereMock.mockReturnValue({
      equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([staleEngine, missingEngine]) })),
    })
    reconcileEngineRecordMock
      .mockResolvedValueOnce('missing')
      .mockResolvedValueOnce('missing')
    const controller = createController()

    await controller.handleDeleteGroup('WebGAL')

    expect(openDeleteEngineGroupModalMock).toHaveBeenCalledWith('WebGAL', {
      allUnavailable: true,
    })
  })

  it('仍有可用版本时不会把整组删除视为只删记录', async () => {
    const availableEngine = createTestEngine({
      id: 'engine-available',
      availability: 'available',
    })
    const missingEngine = createTestEngine({
      id: 'engine-missing',
      availability: 'missing',
    })
    enginesWhereMock.mockReturnValue({
      equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([availableEngine, missingEngine]) })),
    })
    reconcileEngineRecordMock
      .mockResolvedValueOnce('available')
      .mockResolvedValueOnce('missing')
    const controller = createController()

    await controller.handleDeleteGroup('WebGAL')

    expect(openDeleteEngineGroupModalMock).toHaveBeenCalledWith('WebGAL', {
      allUnavailable: false,
    })
  })
})
