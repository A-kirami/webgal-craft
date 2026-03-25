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

describe('useGamesTabController', () => {
  beforeEach(() => {
    importGameMock.mockReset()
    notifyErrorMock.mockReset()
    notifySuccessMock.mockReset()
    notifyWarningMock.mockReset()
    openDialogMock.mockReset()
    openPathMock.mockReset()
    routerPushMock.mockReset()
  })

  it('拖入多个目录时只提示错误且不会触发导入', async () => {
    const openCreateGameModalMock = vi.fn()
    const openDeleteGameModalMock = vi.fn()
    const openNoEngineAlertModalMock = vi.fn()
    const switchToEnginesTabMock = vi.fn()

    const controller = useGamesTabController({
      activeProgress: new Map<string, number>(),
      engines: [{ id: 'engine-1' }],
      openCreateGameModal: openCreateGameModalMock,
      openDeleteGameModal: openDeleteGameModalMock,
      openNoEngineAlertModal: openNoEngineAlertModalMock,
      pushRoute: routerPushMock,
      switchToEnginesTab: switchToEnginesTabMock,
      t: (key: string) => key,
    })

    await controller.handleDrop(['/a', '/b'])

    expect(importGameMock).not.toHaveBeenCalled()
    expect(notifyErrorMock).toHaveBeenCalledWith('home.games.importMultipleFolders')
  })

  it('无可用引擎时创建游戏会弹出引导并可切到引擎标签', () => {
    const openCreateGameModalMock = vi.fn()
    const openDeleteGameModalMock = vi.fn()
    const openNoEngineAlertModalMock = vi.fn()
    const switchToEnginesTabMock = vi.fn()

    const controller = useGamesTabController({
      activeProgress: new Map<string, number>(),
      engines: [],
      openCreateGameModal: openCreateGameModalMock,
      openDeleteGameModal: openDeleteGameModalMock,
      openNoEngineAlertModal: openNoEngineAlertModalMock,
      pushRoute: routerPushMock,
      switchToEnginesTab: switchToEnginesTabMock,
      t: (key: string) => key,
    })

    controller.createGame()

    expect(openNoEngineAlertModalMock).toHaveBeenCalledTimes(1)
    const onConfirm = openNoEngineAlertModalMock.mock.calls[0]?.[0] as (() => void) | undefined
    onConfirm?.()
    expect(switchToEnginesTabMock).toHaveBeenCalledTimes(1)
  })

  it('创建游戏时会读取最新的引擎列表', () => {
    let engines: { id: string }[] | undefined = []
    const openCreateGameModalMock = vi.fn()
    const openDeleteGameModalMock = vi.fn()
    const openNoEngineAlertModalMock = vi.fn()
    const switchToEnginesTabMock = vi.fn()

    const controller = useGamesTabController({
      activeProgress: new Map<string, number>(),
      engines: () => engines,
      openCreateGameModal: openCreateGameModalMock,
      openDeleteGameModal: openDeleteGameModalMock,
      openNoEngineAlertModal: openNoEngineAlertModalMock,
      pushRoute: routerPushMock,
      switchToEnginesTab: switchToEnginesTabMock,
      t: (key: string) => key,
    })

    engines = [{ id: 'engine-1' }]
    controller.createGame()

    expect(openCreateGameModalMock).toHaveBeenCalledTimes(1)
    expect(openNoEngineAlertModalMock).not.toHaveBeenCalled()
  })

  it('游戏处理中点击游戏只提示等待，不会跳转', () => {
    const openCreateGameModalMock = vi.fn()
    const openDeleteGameModalMock = vi.fn()
    const openNoEngineAlertModalMock = vi.fn()
    const switchToEnginesTabMock = vi.fn()

    const controller = useGamesTabController({
      activeProgress: new Map<string, number>([['game-1', 50]]),
      engines: [{ id: 'engine-1' }],
      openCreateGameModal: openCreateGameModalMock,
      openDeleteGameModal: openDeleteGameModalMock,
      openNoEngineAlertModal: openNoEngineAlertModalMock,
      pushRoute: routerPushMock,
      switchToEnginesTab: switchToEnginesTabMock,
      t: (key: string) => key,
    })

    controller.handleGameClick({ id: 'game-1' })

    expect(notifyWarningMock).toHaveBeenCalledWith('home.games.importCreating')
    expect(routerPushMock).not.toHaveBeenCalled()
  })
})
