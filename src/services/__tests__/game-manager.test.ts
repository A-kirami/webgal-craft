import '~/__tests__/setup'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestGame } from '~/__tests__/factories'
import { gameManager } from '~/services/game-manager'
import { AppError } from '~/types/errors'

import type { Game } from '~/database/model'

const {
  copyDirectoryWithProgressMock,
  dbGamesAddMock,
  dbGamesDeleteMock,
  dbGamesGetMock,
  dbGamesUpdateMock,
  dbGamesWhereEqualsMock,
  dbGamesWhereFirstMock,
  dbGamesWhereMock,
  deleteFileMock,
  existsMock,
  gameCmdsGetGameConfigMock,
  gameCmdsSetGameConfigMock,
  gameCoverPathMock,
  gameIconPathMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  removeMock,
  resourceStoreMock,
  useResourceStoreMock,
  useWorkspaceStoreMock,
  workspaceStoreState,
  validateDirectoryStructureMock,
} = vi.hoisted(() => ({
  copyDirectoryWithProgressMock: vi.fn(),
  dbGamesAddMock: vi.fn(),
  dbGamesDeleteMock: vi.fn(),
  dbGamesGetMock: vi.fn(),
  dbGamesUpdateMock: vi.fn(),
  dbGamesWhereEqualsMock: vi.fn(),
  dbGamesWhereFirstMock: vi.fn(),
  dbGamesWhereMock: vi.fn(),
  deleteFileMock: vi.fn(),
  existsMock: vi.fn(),
  gameCmdsGetGameConfigMock: vi.fn(),
  gameCmdsSetGameConfigMock: vi.fn(),
  gameCoverPathMock: vi.fn(),
  gameIconPathMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  removeMock: vi.fn(),
  resourceStoreMock: {
    updateProgress: vi.fn(),
    finishProgress: vi.fn(),
  },
  useResourceStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
  workspaceStoreState: {
    currentGame: {
      id: 'game-1',
      path: '/games/demo',
      createdAt: 0,
      lastModified: 0,
      status: 'created',
      metadata: {
        name: 'Demo Game',
      },
      previewAssets: {
        icon: {
          path: '/games/demo/icon.png',
        },
        cover: {
          path: '/games/demo/cover.png',
        },
      },
    } as Game | undefined,
  },
  validateDirectoryStructureMock: vi.fn(),
}))

function createCurrentGame(overrides: Partial<Game> = {}): Game {
  return createTestGame({
    ...overrides,
    metadata: overrides.metadata,
    previewAssets: overrides.previewAssets,
  })
}

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
  remove: removeMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  info: loggerInfoMock,
  error: loggerErrorMock,
  warn: loggerWarnMock,
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

vi.mock('~/database/db', () => ({
  db: {
    games: {
      add: dbGamesAddMock,
      update: dbGamesUpdateMock,
      delete: dbGamesDeleteMock,
      get: dbGamesGetMock,
      where: dbGamesWhereMock,
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
    dbGamesWhereEqualsMock.mockReset()
    dbGamesWhereFirstMock.mockReset()
    dbGamesWhereMock.mockReset()
    deleteFileMock.mockReset()
    existsMock.mockReset()
    gameCmdsGetGameConfigMock.mockReset()
    gameCmdsSetGameConfigMock.mockReset()
    gameCoverPathMock.mockReset()
    gameIconPathMock.mockReset()
    loggerErrorMock.mockReset()
    loggerInfoMock.mockReset()
    loggerWarnMock.mockReset()
    removeMock.mockReset()
    resourceStoreMock.updateProgress.mockReset()
    resourceStoreMock.finishProgress.mockReset()
    useResourceStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()
    validateDirectoryStructureMock.mockReset()
    dbGamesWhereMock.mockReturnValue({
      equals: dbGamesWhereEqualsMock,
    })
    dbGamesWhereEqualsMock.mockReturnValue({
      first: dbGamesWhereFirstMock,
    })
    workspaceStoreState.currentGame = createCurrentGame()
    useResourceStoreMock.mockReturnValue(resourceStoreMock)
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)
    existsMock.mockResolvedValue(false)
  })

  it('getGameMetadata 只返回语义元数据', async () => {
    gameCmdsGetGameConfigMock.mockResolvedValue({ gameName: 'Demo Game', titleImg: 'cover.png' })

    await expect(gameManager.getGameMetadata('/games/demo')).resolves.toEqual({
      name: 'Demo Game',
    })
  })

  it('getGamePreviewAssets 只返回封面和图标路径', async () => {
    gameCmdsGetGameConfigMock.mockResolvedValue({ gameName: 'Demo Game', titleImg: 'cover.png' })
    gameIconPathMock.mockResolvedValue('/games/demo/icons/icon.png')
    gameCoverPathMock.mockResolvedValue('/games/demo/assets/cover.png')

    await expect(gameManager.getGamePreviewAssets('/games/demo')).resolves.toEqual({
      icon: {
        path: '/games/demo/icons/icon.png',
      },
      cover: {
        path: '/games/demo/assets/cover.png',
      },
    })
  })

  it('registerGame 会保留调用方提供的 metadata 并只补齐缺失的 previewAssets', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
    dbGamesAddMock.mockResolvedValue('game-1')
    gameCmdsGetGameConfigMock.mockResolvedValue({ gameName: 'Resolved Name', titleImg: 'cover.png' })
    gameIconPathMock.mockResolvedValue('/games/demo/icons/icon.png')
    gameCoverPathMock.mockResolvedValue('/games/demo/assets/cover.png')

    await gameManager.registerGame('/games/demo', {
      metadata: {
        name: 'Provided Name',
      },
    })

    expect(dbGamesAddMock).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        name: 'Provided Name',
      },
      previewAssets: {
        icon: {
          path: '/games/demo/icons/icon.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: '/games/demo/assets/cover.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('createGame 会注册占位游戏、复制引擎并在结束后回写元数据', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
    const randomUuidSpy = vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-1111-1111-111111111111')
      .mockReturnValueOnce('22222222-2222-2222-2222-222222222222')
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
      },
      previewAssets: {
        icon: {
          path: '',
        },
        cover: {
          path: '',
        },
      },
    }))
    expect(gameCmdsSetGameConfigMock).toHaveBeenCalledWith('/games/demo', {
      set: {
        gameKey: '22222222-2222-2222-2222-222222222222',
        gameName: 'Demo Game',
      },
      unset: [],
    })
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(1, 'game-1', 25)
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(2, 'game-1', 100)
    expect(resourceStoreMock.finishProgress).toHaveBeenCalledWith('game-1')
    expect(dbGamesUpdateMock).toHaveBeenCalledWith('game-1', {
      status: 'created',
      metadata: {
        name: 'Demo Game',
      },
      previewAssets: {
        icon: {
          path: '/games/demo/icons/icon.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: '/games/demo/assets/cover.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
    })

    randomUuidSpy.mockRestore()
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

  it('refreshRegisteredGameSnapshot 会按路径刷新数据库快照，并同步当前工作区游戏', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
    dbGamesWhereFirstMock.mockResolvedValue(createCurrentGame({
      metadata: {
        name: 'Old Name',
      },
      previewAssets: {
        icon: {
          path: '/games/demo/icons/favicon.ico',
          cacheVersion: 111,
        },
        cover: {
          path: '/games/demo/assets/cover-old.png',
          cacheVersion: 222,
        },
      },
    }))
    gameCmdsGetGameConfigMock.mockResolvedValue({
      gameName: 'Renamed Game',
      titleImg: 'cover-next.png',
    })
    gameIconPathMock.mockResolvedValue('/games/demo/icons/favicon.ico')
    gameCoverPathMock.mockResolvedValue('/games/demo/assets/cover-next.png')
    workspaceStoreState.currentGame = createCurrentGame({
      metadata: {
        name: 'Old Name',
      },
      previewAssets: {
        icon: {
          path: '/games/demo/icons/favicon.ico',
          cacheVersion: 111,
        },
        cover: {
          path: '/games/demo/assets/cover-old.png',
          cacheVersion: 222,
        },
      },
    })

    await gameManager.refreshRegisteredGameSnapshot('/games/demo')

    expect(dbGamesUpdateMock).toHaveBeenCalledWith('game-1', {
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
      metadata: {
        name: 'Renamed Game',
      },
      previewAssets: {
        icon: {
          path: '/games/demo/icons/favicon.ico',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: '/games/demo/assets/cover-next.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
    })
    expect(workspaceStoreState.currentGame).toMatchObject({
      id: 'game-1',
      path: '/games/demo',
      metadata: {
        name: 'Renamed Game',
      },
      previewAssets: {
        icon: {
          path: '/games/demo/icons/favicon.ico',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: '/games/demo/assets/cover-next.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
    })
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
      },
      previewAssets: {
        icon: {
          path: '',
        },
        cover: {
          path: '',
        },
      },
    }, true)

    expect(deleteFileMock).toHaveBeenCalledWith('/games/demo')
    expect(dbGamesDeleteMock).toHaveBeenCalledWith('game-1')
    expect(deleteFileMock.mock.invocationCallOrder[0]).toBeLessThan(dbGamesDeleteMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY)
  })

  it('updateGameLastModified 会刷新预览资源快照与缓存版本', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
    workspaceStoreState.currentGame = {
      ...createCurrentGame({
        metadata: {
          name: 'Demo',
        },
        previewAssets: {
          icon: {
            path: '/games/demo/icons/favicon.ico',
            cacheVersion: 111,
          },
          cover: {
            path: '/games/demo/assets/cover.png',
            cacheVersion: 222,
          },
        },
      }),
    }
    dbGamesGetMock.mockResolvedValue({
      id: 'game-1',
      path: '/games/demo',
    })
    gameCmdsGetGameConfigMock.mockResolvedValue({ gameName: 'Changed Name', titleImg: 'cover-next.png' })
    gameIconPathMock.mockResolvedValue('/games/demo/icons/next.ico')
    gameCoverPathMock.mockResolvedValue('/games/demo/assets/cover-next.png')

    await gameManager.updateGameLastModified('game-1')

    expect(dbGamesUpdateMock).toHaveBeenCalledWith('game-1', {
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
      previewAssets: {
        icon: {
          path: '/games/demo/icons/next.ico',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: '/games/demo/assets/cover-next.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
    })
    expect(workspaceStoreState.currentGame).toEqual({
      id: 'game-1',
      path: '/games/demo',
      createdAt: 0,
      status: 'created',
      metadata: {
        name: 'Demo',
      },
      previewAssets: {
        icon: {
          path: '/games/demo/icons/next.ico',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: '/games/demo/assets/cover-next.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
    })
  })

  it('updateGameLastModified 在游戏记录不存在时不会继续更新数据库或当前工作区状态', async () => {
    dbGamesGetMock.mockResolvedValue(undefined)

    await gameManager.updateGameLastModified('game-1')

    expect(dbGamesUpdateMock).not.toHaveBeenCalled()
    expect(workspaceStoreState.currentGame).toEqual(createCurrentGame())
  })

  it('updateGameLastModified 在预览资源解析失败时仍会推进预览缓存版本', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
    dbGamesGetMock.mockResolvedValue({
      id: 'game-1',
      path: '/games/demo',
      previewAssets: {
        icon: {
          path: '/games/demo/icons/current.ico',
          cacheVersion: 111,
        },
        cover: {
          path: '/games/demo/assets/current-cover.png',
          cacheVersion: 222,
        },
      },
    })
    workspaceStoreState.currentGame = createCurrentGame({
      metadata: {
        name: 'Demo',
      },
      previewAssets: {
        icon: {
          path: '/games/demo/icons/current.ico',
          cacheVersion: 111,
        },
        cover: {
          path: '/games/demo/assets/current-cover.png',
          cacheVersion: 222,
        },
      },
    })
    gameCmdsGetGameConfigMock.mockResolvedValue({ gameName: 'Demo Game', titleImg: 'cover.png' })
    gameIconPathMock.mockRejectedValue(new Error('icon missing'))

    await gameManager.updateGameLastModified('game-1')

    expect(dbGamesUpdateMock).toHaveBeenCalledWith('game-1', {
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
      previewAssets: {
        icon: {
          path: '/games/demo/icons/current.ico',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: '/games/demo/assets/current-cover.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
    })
    expect(loggerWarnMock).toHaveBeenCalledWith('刷新游戏预览资源快照失败: Error: icon missing')
    expect(workspaceStoreState.currentGame).toEqual({
      id: 'game-1',
      path: '/games/demo',
      createdAt: 0,
      status: 'created',
      metadata: {
        name: 'Demo',
      },
      previewAssets: {
        icon: {
          path: '/games/demo/icons/current.ico',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: '/games/demo/assets/current-cover.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
    })
  })

  it('updateCurrentGameLastModified 会按 500ms 防抖更新当前游戏', async () => {
    vi.useFakeTimers()
    dbGamesGetMock.mockResolvedValue({
      id: 'game-1',
      path: '/games/demo',
    })

    gameManager.updateCurrentGameLastModified()
    gameManager.updateCurrentGameLastModified()

    expect(dbGamesUpdateMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)

    expect(dbGamesUpdateMock).toHaveBeenCalledTimes(1)
    expect(dbGamesUpdateMock).toHaveBeenCalledWith('game-1', expect.objectContaining({
      lastModified: expect.any(Number),
    }))
  })

  it('不再暴露 runGamePreview', () => {
    expect('runGamePreview' in gameManager).toBe(false)
  })
})
