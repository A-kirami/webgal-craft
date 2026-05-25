import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestGame } from '~/__tests__/factories'

import { useGamesTabController } from '../useGamesTabController'

const {
  importGameMock,
  notifyErrorMock,
  notifyInfoMock,
  notifySuccessMock,
  notifyWarningMock,
  openDialogMock,
  openPathMock,
  reconcileGameRecordMock,
  requestImportDependencyResolutionMock,
  routerPushMock,
} = vi.hoisted(() => ({
  importGameMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifyInfoMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  notifyWarningMock: vi.fn(),
  openDialogMock: vi.fn(),
  openPathMock: vi.fn(),
  reconcileGameRecordMock: vi.fn(),
  requestImportDependencyResolutionMock: vi.fn(),
  routerPushMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: openPathMock,
}))

vi.mock('notivue', () => ({
  push: {
    error: notifyErrorMock,
    info: notifyInfoMock,
    success: notifySuccessMock,
    warning: notifyWarningMock,
  },
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
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

describe('useGamesTabController', () => {
  const openCreateGameModalMock = vi.fn()
  const openDeleteGameModalMock = vi.fn()
  const openNoEngineAlertModalMock = vi.fn()
  const openRecoverGameModalMock = vi.fn()
  const switchToEnginesTabMock = vi.fn()

  function createController(overrides?: Partial<Parameters<typeof useGamesTabController>[0]>) {
    return useGamesTabController({
      activeProgress: new Map<string, number>(),
      engines: [{ id: 'engine-1', status: 'created', availability: 'available' }],
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
    reconcileGameRecordMock.mockResolvedValue('available')
  })

  it('拖入多个目录时只提示错误且不会触发导入', async () => {
    const controller = createController()

    await controller.handleDrop(['/a', '/b'])

    expect(importGameMock).not.toHaveBeenCalled()
    expect(notifyErrorMock).toHaveBeenCalledWith('home.games.importMultipleFolders')
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
    let engines: { id: string, status: 'created' | 'error', availability: 'available' | 'broken' }[] | undefined = []

    const controller = createController({ engines: () => engines })

    engines = [{ id: 'engine-1', status: 'created', availability: 'available' }]
    controller.createGame()

    expect(openCreateGameModalMock).toHaveBeenCalledTimes(1)
    expect(openNoEngineAlertModalMock).not.toHaveBeenCalled()
  })

  it('已安装引擎全部失效时创建游戏会弹出引导', () => {
    const controller = createController({
      engines: [
        { id: 'engine-1', status: 'error', availability: 'available' },
        { id: 'engine-2', status: 'creating', availability: 'available' },
      ],
    })

    controller.createGame()

    expect(openCreateGameModalMock).not.toHaveBeenCalled()
    expect(openNoEngineAlertModalMock).toHaveBeenCalledTimes(1)
  })

  it('已安装引擎仅有 broken availability 时创建游戏会弹出引导', () => {
    const controller = createController({
      engines: [
        { id: 'engine-1', status: 'created', availability: 'broken' },
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

    expect(notifyWarningMock).toHaveBeenCalledWith('home.games.importCreating')
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('游戏未处理中点击会跳转到编辑器', async () => {
    const controller = createController()

    await controller.handleGameClick(createTestGame({ id: 'game-2' }))

    expect(notifyWarningMock).not.toHaveBeenCalled()
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

  it('选择目录导入已注册游戏时按 info 级提示已存在', async () => {
    openDialogMock.mockResolvedValue('/games/registered')
    importGameMock.mockResolvedValue({ id: 'game-existing', alreadyRegistered: true })

    const controller = createController()

    await controller.selectGameFolder()

    expect(notifyErrorMock).not.toHaveBeenCalled()
    expect(notifySuccessMock).not.toHaveBeenCalled()
    expect(notifyInfoMock).toHaveBeenCalledWith('home.games.importAlreadyExists')
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
