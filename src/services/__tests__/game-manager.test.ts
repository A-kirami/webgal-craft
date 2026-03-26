import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { gameManager } from '~/services/game-manager'
import { AppError } from '~/types/errors'

const {
  copyDirectoryWithProgressMock,
  dbGamesAddMock,
  dbGamesDeleteMock,
  dbGamesGetMock,
  dbGamesUpdateMock,
  deleteFileMock,
  existsMock,
  gameCmdsGetGameConfigMock,
  gameCmdsSetGameConfigMock,
  gameCoverPathMock,
  gameIconPathMock,
  loggerErrorMock,
  loggerInfoMock,
  removeMock,
  resourceStoreMock,
  serverAddStaticSiteMock,
  serverRemoveStaticSiteMock,
  useResourceStoreMock,
  useWorkspaceStoreMock,
  validateDirectoryStructureMock,
} = vi.hoisted(() => ({
  copyDirectoryWithProgressMock: vi.fn(),
  dbGamesAddMock: vi.fn(),
  dbGamesDeleteMock: vi.fn(),
  dbGamesGetMock: vi.fn(),
  dbGamesUpdateMock: vi.fn(),
  deleteFileMock: vi.fn(),
  existsMock: vi.fn(),
  gameCmdsGetGameConfigMock: vi.fn(),
  gameCmdsSetGameConfigMock: vi.fn(),
  gameCoverPathMock: vi.fn(),
  gameIconPathMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  removeMock: vi.fn(),
  resourceStoreMock: {
    updateProgress: vi.fn(),
    finishProgress: vi.fn(),
  },
  serverAddStaticSiteMock: vi.fn(),
  serverRemoveStaticSiteMock: vi.fn(),
  useResourceStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
  validateDirectoryStructureMock: vi.fn(),
}))

const workspaceStoreState = {
  currentGame: { id: 'game-1' },
}

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
  remove: removeMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  info: loggerInfoMock,
  error: loggerErrorMock,
  warn: vi.fn(),
  debug: vi.fn(),
  attachConsole: vi.fn(),
}))

vi.mock('~/commands/fs', () => ({
  fsCmds: {
    validateDirectoryStructure: validateDirectoryStructureMock,
    copyDirectoryWithProgress: copyDirectoryWithProgressMock,
    deleteFile: deleteFileMock,
  },
}))

vi.mock('~/commands/game', () => ({
  gameCmds: {
    getGameConfig: gameCmdsGetGameConfigMock,
    setGameConfig: gameCmdsSetGameConfigMock,
  },
}))

vi.mock('~/commands/server', () => ({
  serverCmds: {
    addStaticSite: serverAddStaticSiteMock,
    removeStaticSite: serverRemoveStaticSiteMock,
  },
}))

vi.mock('~/database/db', () => ({
  db: {
    games: {
      add: dbGamesAddMock,
      update: dbGamesUpdateMock,
      delete: dbGamesDeleteMock,
      get: dbGamesGetMock,
    },
  },
}))

vi.mock('~/services/platform/app-paths', () => ({
  gameIconPath: gameIconPathMock,
  gameCoverPath: gameCoverPathMock,
}))

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

describe('gameManager 游戏管理', () => {
  beforeEach(() => {
    vi.useRealTimers()
    copyDirectoryWithProgressMock.mockReset()
    dbGamesAddMock.mockReset()
    dbGamesDeleteMock.mockReset()
    dbGamesGetMock.mockReset()
    dbGamesUpdateMock.mockReset()
    deleteFileMock.mockReset()
    existsMock.mockReset()
    gameCmdsGetGameConfigMock.mockReset()
    gameCmdsSetGameConfigMock.mockReset()
    gameCoverPathMock.mockReset()
    gameIconPathMock.mockReset()
    loggerErrorMock.mockReset()
    loggerInfoMock.mockReset()
    removeMock.mockReset()
    resourceStoreMock.updateProgress.mockReset()
    resourceStoreMock.finishProgress.mockReset()
    serverAddStaticSiteMock.mockReset()
    serverRemoveStaticSiteMock.mockReset()
    useResourceStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()
    validateDirectoryStructureMock.mockReset()
    useResourceStoreMock.mockReturnValue(resourceStoreMock)
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)
    existsMock.mockResolvedValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('createGame 会注册占位游戏、复制引擎并在结束后回写元数据', async () => {
    dbGamesAddMock.mockResolvedValue('game-1')
    copyDirectoryWithProgressMock.mockImplementation(async (_from, _to, onProgress: (progress: number) => void) => {
      onProgress(25)
      onProgress(100)
    })
    gameCmdsGetGameConfigMock.mockResolvedValue({ gameName: 'Demo Game', titleImg: 'cover.png' })
    gameIconPathMock.mockResolvedValue('/games/demo/icons/icon.png')
    gameCoverPathMock.mockResolvedValue('/games/demo/assets/cover.png')

    const id = await gameManager.createGame('Demo Game', '/games/demo', '/engines/base')

    expect(id).toBe('game-1')
    expect(dbGamesAddMock).toHaveBeenCalledWith(expect.objectContaining({
      path: '/games/demo',
      status: 'creating',
      metadata: {
        name: 'Demo Game',
        icon: '',
        cover: '',
      },
    }))
    expect(gameCmdsSetGameConfigMock).toHaveBeenCalledWith('/games/demo', { gameName: 'Demo Game' })
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(1, 'game-1', 25)
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(2, 'game-1', 100)
    expect(resourceStoreMock.finishProgress).toHaveBeenCalledWith('game-1')
    expect(dbGamesUpdateMock).toHaveBeenCalledWith('game-1', {
      status: 'created',
      metadata: {
        name: 'Demo Game',
        icon: '/games/demo/icons/icon.png',
        cover: '/games/demo/assets/cover.png',
      },
    })
  })

  it('createGame 在注册后失败时会回滚占位记录、进度和目标目录', async () => {
    dbGamesAddMock.mockResolvedValue('game-1')
    existsMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    copyDirectoryWithProgressMock.mockResolvedValue(undefined)
    gameCmdsSetGameConfigMock.mockRejectedValue(new Error('config failed'))

    await expect(gameManager.createGame('Demo Game', '/games/demo', '/engines/base')).rejects.toThrow('config failed')

    expect(resourceStoreMock.finishProgress).toHaveBeenCalledWith('game-1')
    expect(dbGamesDeleteMock).toHaveBeenCalledWith('game-1')
    expect(deleteFileMock).toHaveBeenCalledWith('/games/demo', true)
    expect(dbGamesUpdateMock).not.toHaveBeenCalled()
  })

  it('createGame 在目标目录已存在且复制失败时不会删除既有目录', async () => {
    dbGamesAddMock.mockResolvedValue('game-1')
    existsMock.mockResolvedValue(true)
    copyDirectoryWithProgressMock.mockRejectedValue(new Error('copy failed'))

    await expect(gameManager.createGame('Demo Game', '/games/demo', '/engines/base')).rejects.toThrow('copy failed')

    expect(dbGamesDeleteMock).toHaveBeenCalledWith('game-1')
    expect(deleteFileMock).not.toHaveBeenCalled()
    expect(dbGamesUpdateMock).not.toHaveBeenCalled()
  })

  it('importGame 遇到非法目录结构时会抛出 INVALID_STRUCTURE', async () => {
    validateDirectoryStructureMock.mockResolvedValue(false)

    await expect(gameManager.importGame('/broken-game')).rejects.toEqual(
      new AppError('INVALID_STRUCTURE', '无效的游戏文件夹'),
    )
  })

  it('deleteGame 在 removeFiles=true 时会通过 fs 命令将游戏目录移动到回收站', async () => {
    await gameManager.deleteGame({
      id: 'game-1',
      path: '/games/demo',
      createdAt: 0,
      lastModified: 0,
      status: 'created',
      metadata: {
        name: 'Demo',
        icon: '',
        cover: '',
      },
    }, true)

    expect(deleteFileMock).toHaveBeenCalledWith('/games/demo')
    expect(dbGamesDeleteMock).toHaveBeenCalledWith('game-1')
    expect(deleteFileMock.mock.invocationCallOrder[0]).toBeLessThan(dbGamesDeleteMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY)
  })

  it('updateCurrentGameLastModified 会按 500ms 防抖更新当前游戏', async () => {
    vi.useFakeTimers()

    gameManager.updateCurrentGameLastModified()
    gameManager.updateCurrentGameLastModified()

    expect(dbGamesUpdateMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)

    expect(dbGamesUpdateMock).toHaveBeenCalledTimes(1)
    expect(dbGamesUpdateMock).toHaveBeenCalledWith('game-1', {
      lastModified: expect.any(Number),
    })
  })
})
