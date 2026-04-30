import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useGamesTabController } from '../useGamesTabController'

const {
  importGameMock,
  notifyErrorMock,
  notifySuccessMock,
  notifyWarningMock,
  openDialogMock,
  openPathMock,
  routerPushMock,
} = vi.hoisted(() => ({
  importGameMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  notifyWarningMock: vi.fn(),
  openDialogMock: vi.fn(),
  openPathMock: vi.fn(),
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
    success: notifySuccessMock,
    warning: notifyWarningMock,
  },
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    importGame: importGameMock,
  },
}))

describe('useGamesTabController 行为', () => {
  const openCreateGameModalMock = vi.fn()
  const openDeleteGameModalMock = vi.fn()
  const openNoEngineAlertModalMock = vi.fn()
  const switchToEnginesTabMock = vi.fn()

  function createController(overrides?: Partial<Parameters<typeof useGamesTabController>[0]>) {
    return useGamesTabController({
      activeProgress: new Map<string, number>(),
      engines: [{ id: 'engine-1', status: 'created' }],
      openCreateGameModal: openCreateGameModalMock,
      openDeleteGameModal: openDeleteGameModalMock,
      openNoEngineAlertModal: openNoEngineAlertModalMock,
      pushRoute: routerPushMock,
      switchToEnginesTab: switchToEnginesTabMock,
      t: (key: string) => key,
      ...overrides,
    })
  }

  beforeEach(() => {
    vi.resetAllMocks()
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
    let engines: { id: string, status: 'created' | 'error' }[] | undefined = []

    const controller = createController({ engines: () => engines })

    engines = [{ id: 'engine-1', status: 'created' }]
    controller.createGame()

    expect(openCreateGameModalMock).toHaveBeenCalledTimes(1)
    expect(openNoEngineAlertModalMock).not.toHaveBeenCalled()
  })

  it('已安装引擎全部失效时创建游戏会弹出引导', () => {
    const controller = createController({
      engines: [
        { id: 'engine-1', status: 'error' },
        { id: 'engine-2', status: 'creating' },
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

  it('游戏处理中点击游戏只提示等待，不会跳转', () => {
    const controller = createController({
      activeProgress: new Map<string, number>([['game-1', 50]]),
    })

    controller.handleGameClick({ id: 'game-1' })

    expect(notifyWarningMock).toHaveBeenCalledWith('home.games.importCreating')
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('游戏未处理中点击会跳转到编辑器', () => {
    const controller = createController()

    controller.handleGameClick({ id: 'game-2' })

    expect(notifyWarningMock).not.toHaveBeenCalled()
    expect(routerPushMock).toHaveBeenCalledWith('/edit/game-2')
  })

  it('选择目录导入已注册游戏时按幂等成功提示', async () => {
    openDialogMock.mockResolvedValue('/games/registered')
    importGameMock.mockResolvedValue('game-existing')

    const controller = createController()

    await controller.selectGameFolder()

    expect(notifyErrorMock).not.toHaveBeenCalled()
  })
})
