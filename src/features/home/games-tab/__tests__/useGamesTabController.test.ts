import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine, createTestGame } from '~/__tests__/factories'
import { MIN_WEBGAL_EDITOR_RUNTIME_VERSION } from '~/domain/engine/runtime-capabilities'
import { AppError } from '~/types/errors'

import { useGamesTabController } from '../useGamesTabController'

const {
  ensureEditorRuntimeCompatibleMock,
  importGameMock,
  toastErrorMock,
  toastInfoMock,
  toastSuccessMock,
  toastWarningMock,
  openDialogMock,
  openPathMock,
  reconcileGameRecordMock,
  requestGameRuntimeRebindMock,
  requestImportDependencyResolutionMock,
  resolveRuntimeRebindIssueMock,
  routerPushMock,
} = vi.hoisted(() => ({
  ensureEditorRuntimeCompatibleMock: vi.fn(),
  importGameMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastWarningMock: vi.fn(),
  openDialogMock: vi.fn(),
  openPathMock: vi.fn(),
  reconcileGameRecordMock: vi.fn(),
  requestGameRuntimeRebindMock: vi.fn(),
  requestImportDependencyResolutionMock: vi.fn(),
  resolveRuntimeRebindIssueMock: vi.fn(),
  routerPushMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: openPathMock,
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastErrorMock,
    info: toastInfoMock,
    success: toastSuccessMock,
    warning: toastWarningMock,
  },
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    ensureEditorRuntimeCompatible: ensureEditorRuntimeCompatibleMock,
    importGame: importGameMock,
  },
}))

vi.mock('~/services/resource-reconcile', () => ({
  resourceReconcile: {
    reconcileGameRecord: reconcileGameRecordMock,
  },
}))

vi.mock('~/features/modals/import-dependency-resolution/request-import-dependency-resolution', () => ({
  requestImportDependencyResolution: requestImportDependencyResolutionMock,
}))

vi.mock('~/features/modals/import-dependency-resolution/request-game-runtime-rebind', () => ({
  requestGameRuntimeRebind: requestGameRuntimeRebindMock,
  resolveRuntimeRebindIssue: resolveRuntimeRebindIssueMock,
}))

describe('useGamesTabController', () => {
  const openCreateGameModalMock = vi.fn()
  const openDeleteGameModalMock = vi.fn()
  const openNoEngineAlertModalMock = vi.fn()
  const openRecoverGameModalMock = vi.fn()
  const switchToEnginesTabMock = vi.fn()

  function createController(overrides?: Partial<Parameters<typeof useGamesTabController>[0]>) {
    return useGamesTabController({
      activeProgress: new Map<string, number>(),
      android: false,
      engines: [createTestEngine({ id: 'engine-1' })],
      openCreateGameModal: openCreateGameModalMock,
      openDeleteGameModal: openDeleteGameModalMock,
      openNoEngineAlertModal: openNoEngineAlertModalMock,
      openRecoverGameModal: openRecoverGameModalMock,
      pushRoute: routerPushMock,
      switchToEnginesTab: switchToEnginesTabMock,
      t: (key: string) => key,
      ...overrides,
    })
  }

  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    ensureEditorRuntimeCompatibleMock.mockResolvedValue(undefined)
    reconcileGameRecordMock.mockResolvedValue('available')
    requestGameRuntimeRebindMock.mockResolvedValue(false)
    resolveRuntimeRebindIssueMock.mockImplementation((issue: unknown) => {
      switch (issue) {
        case 'unavailable': {
          return { reason: 'unavailable' }
        }
        case 'versionInvalid':
        case 'versionTooOld': {
          return { compatibilityIssue: issue, reason: 'incompatible' }
        }
        default: {
          return { reason: 'incompatible' }
        }
      }
    })
  })

  it('拖入多个目录时只提示错误且不会触发导入', async () => {
    const controller = createController()

    await controller.handleDrop(['/a', '/b'])

    expect(importGameMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith('home.games.importMultipleFolders')
  })

  it('无可用引擎时创建游戏会弹出引导并可切到引擎标签', () => {
    const controller = createController({ engines: [] })

    controller.createGame()

    expect(openNoEngineAlertModalMock).toHaveBeenCalledTimes(1)
    const onConfirm = openNoEngineAlertModalMock.mock.calls[0]?.[0] as (() => void) | undefined
    onConfirm?.()
    expect(switchToEnginesTabMock).toHaveBeenCalledTimes(1)
  })

  it('创建游戏时会读取最新的引擎列表', () => {
    let engines: ReturnType<typeof createTestEngine>[] | undefined = []

    const controller = createController({ engines: () => engines })

    engines = [createTestEngine({ id: 'engine-1' })]
    controller.createGame()

    expect(openCreateGameModalMock).toHaveBeenCalledTimes(1)
    expect(openNoEngineAlertModalMock).not.toHaveBeenCalled()
  })

  it('已安装引擎全部失效时创建游戏会弹出引导', () => {
    const controller = createController({
      engines: [
        createTestEngine({ id: 'engine-1', status: 'error', availability: 'available' }),
        createTestEngine({ id: 'engine-2', status: 'creating', availability: 'available' }),
      ],
    })

    controller.createGame()

    expect(openCreateGameModalMock).not.toHaveBeenCalled()
    expect(openNoEngineAlertModalMock).toHaveBeenCalledTimes(1)
  })

  it('已安装引擎仅有 broken availability 时创建游戏会弹出引导', () => {
    const controller = createController({
      engines: [
        createTestEngine({ id: 'engine-1', availability: 'broken' }),
      ],
    })

    controller.createGame()

    expect(openCreateGameModalMock).not.toHaveBeenCalled()
    expect(openNoEngineAlertModalMock).toHaveBeenCalledTimes(1)
  })

  it('已安装引擎仅有不兼容运行时时创建游戏会弹出引导', () => {
    const controller = createController({
      engines: [
        createTestEngine({
          id: 'engine-old',
          metadata: { webgalVersion: '4.6.0' },
        }),
      ],
    })

    controller.createGame()

    expect(openCreateGameModalMock).not.toHaveBeenCalled()
    expect(openNoEngineAlertModalMock).toHaveBeenCalledTimes(1)
  })

  it('引擎状态未知时创建游戏不会执行任何操作', () => {
    const controller = createController({ engines: undefined })

    controller.createGame()

    expect(openCreateGameModalMock).not.toHaveBeenCalled()
    expect(openNoEngineAlertModalMock).not.toHaveBeenCalled()
    expect(switchToEnginesTabMock).not.toHaveBeenCalled()
  })

  it('游戏处理中点击游戏只提示等待，不会跳转', async () => {
    const controller = createController({
      activeProgress: new Map<string, number>([['game-1', 50]]),
    })

    await controller.handleGameClick(createTestGame({ id: 'game-1' }))

    expect(toastWarningMock).toHaveBeenCalledWith('home.games.importCreating')
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('游戏未处理中点击会跳转到编辑器', async () => {
    const controller = createController()

    await controller.handleGameClick(createTestGame({ id: 'game-2' }))

    expect(toastWarningMock).not.toHaveBeenCalled()
    expect(routerPushMock).toHaveBeenCalledWith('/edit/game-2')
  })

  it('点击时即时校验发现失效会进入恢复弹窗，而不是直接跳转', async () => {
    reconcileGameRecordMock.mockResolvedValue('missing')

    const controller = createController()
    const game = createTestGame({ id: 'game-stale', availability: 'available' })

    await controller.handleGameClick(game)

    expect(openRecoverGameModalMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'game-stale', availability: 'missing' }),
    )
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('点击时即时校验回切到 available 会照常跳转编辑器', async () => {
    reconcileGameRecordMock.mockResolvedValue('available')

    const controller = createController()
    const game = createTestGame({ id: 'game-recovered', availability: 'missing' })

    await controller.handleGameClick(game)

    expect(openRecoverGameModalMock).not.toHaveBeenCalled()
    expect(routerPushMock).toHaveBeenCalledWith('/edit/game-recovered')
  })

  it('点击时运行时不兼容会请求依赖重选重绑引擎，成功后进入编辑器', async () => {
    ensureEditorRuntimeCompatibleMock.mockRejectedValue(new AppError('ENGINE_EDITOR_INCOMPATIBLE', '引擎版本过低', {
      details: {
        issue: 'versionTooOld',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    }))
    requestGameRuntimeRebindMock.mockResolvedValue(true)

    const controller = createController()
    const game = createTestGame({ id: 'game-old-engine', availability: 'available' })

    await controller.handleGameClick(game)

    expect(resolveRuntimeRebindIssueMock).toHaveBeenCalledWith('versionTooOld')
    expect(requestGameRuntimeRebindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'game-old-engine',
        availability: 'available',
      }),
      {
        compatibilityIssue: 'versionTooOld',
        reason: 'incompatible',
        resolveDependencies: requestImportDependencyResolutionMock,
      },
    )
    expect(openRecoverGameModalMock).not.toHaveBeenCalled()
    expect(routerPushMock).toHaveBeenCalledWith('/edit/game-old-engine')
  })

  it('点击时运行时不兼容但用户取消依赖重选时不会进入编辑器', async () => {
    ensureEditorRuntimeCompatibleMock.mockRejectedValue(new AppError('ENGINE_EDITOR_INCOMPATIBLE', '引擎版本过低', {
      details: {
        issue: 'versionTooOld',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    }))
    requestGameRuntimeRebindMock.mockResolvedValue(false)

    const controller = createController()
    const game = createTestGame({ id: 'game-old-engine', availability: 'available' })

    await controller.handleGameClick(game)

    expect(resolveRuntimeRebindIssueMock).toHaveBeenCalledWith('versionTooOld')
    expect(requestGameRuntimeRebindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'game-old-engine',
        availability: 'available',
      }),
      {
        compatibilityIssue: 'versionTooOld',
        reason: 'incompatible',
        resolveDependencies: requestImportDependencyResolutionMock,
      },
    )
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('选择目录导入已注册游戏时按 info 级提示已存在', async () => {
    openDialogMock.mockResolvedValue('/games/registered')
    importGameMock.mockResolvedValue({ id: 'game-existing', alreadyRegistered: true })

    const controller = createController()

    await controller.selectGameFolder()

    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastInfoMock).toHaveBeenCalledWith('home.games.importAlreadyExists')
  })

  it('导入绑定过旧引擎的游戏时会把最低运行时版本传给通知文案', async () => {
    openDialogMock.mockResolvedValue('/games/old-engine')
    importGameMock.mockRejectedValue(new AppError('ENGINE_EDITOR_INCOMPATIBLE', 'too old', {
      details: {
        issue: 'versionTooOld',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    }))
    const t = vi.fn((key: string, ...args: unknown[]) => {
      const named = args[0] as { version?: unknown } | undefined
      return `${key}:${String(named?.version ?? '')}`
    })

    const controller = createController({ t })

    await controller.selectGameFolder()

    expect(toastErrorMock).toHaveBeenCalledWith(
      `home.games.importEngineVersionTooOld:${MIN_WEBGAL_EDITOR_RUNTIME_VERSION}`,
    )
  })

  it('导入游戏时会提供组合依赖解析回调', async () => {
    openDialogMock.mockResolvedValue('/games/import-target')
    importGameMock.mockResolvedValue({ id: 'game-imported', alreadyRegistered: false })

    const controller = createController()

    await controller.selectGameFolder()

    expect(importGameMock).toHaveBeenCalledWith('/games/import-target', {
      resolveDependencies: requestImportDependencyResolutionMock,
    })
  })
})
