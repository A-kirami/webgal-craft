import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine, createTestGame } from '~/__tests__/factories'
import { gameManager } from '~/services/game-manager'
import { AppError } from '~/types/errors'

const {
  copyDirectoryWithProgressMock,
  copyFileFsMock,
  dbEngineGetMock,
  dbGameAddMock,
  dbGameDeleteMock,
  dbGameGetMock,
  dbGamesToArrayMock,
  dbGameUpdateMock,
  dbGameWhereEqualsMock,
  dbGameWhereFirstMock,
  dbGameWhereMock,
  deleteFileMock,
  engineFindByRefMock,
  ensureWritableMock,
  existsMock,
  gameCmdsGetGameConfigMock,
  gameCmdsSetGameConfigMock,
  gameConfigPathMock,
  joinMock,
  mkdirMock,
  projectConfigPathMock,
  resourceStoreState,
  readProjectConfigMock,
  toastWarningMock,
  warnMock,
  writeProjectConfigMock,
  workspaceStoreState,
} = vi.hoisted(() => ({
  copyDirectoryWithProgressMock: vi.fn(),
  copyFileFsMock: vi.fn(),
  dbEngineGetMock: vi.fn(),
  dbGameAddMock: vi.fn(),
  dbGameDeleteMock: vi.fn(),
  dbGameGetMock: vi.fn(),
  dbGamesToArrayMock: vi.fn(),
  dbGameUpdateMock: vi.fn(),
  dbGameWhereEqualsMock: vi.fn(),
  dbGameWhereFirstMock: vi.fn(),
  dbGameWhereMock: vi.fn(),
  deleteFileMock: vi.fn(),
  engineFindByRefMock: vi.fn(),
  ensureWritableMock: vi.fn(),
  existsMock: vi.fn(),
  gameCmdsGetGameConfigMock: vi.fn(),
  gameCmdsSetGameConfigMock: vi.fn(),
  gameConfigPathMock: vi.fn(),
  joinMock: vi.fn(async (...parts: string[]) => parts.join('/').replaceAll('//', '/')),
  mkdirMock: vi.fn(),
  projectConfigPathMock: vi.fn(),
  resourceStoreState: {
    finishProgress: vi.fn(),
    updateProgress: vi.fn(),
  },
  readProjectConfigMock: vi.fn(),
  toastWarningMock: vi.fn(),
  warnMock: vi.fn(),
  writeProjectConfigMock: vi.fn(),
  workspaceStoreState: {
    currentGame: undefined as ReturnType<typeof createTestGame> | undefined,
  },
}))

vi.mock('@tauri-apps/api/path', () => ({
  join: joinMock,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  copyFile: copyFileFsMock,
  exists: existsMock,
  mkdir: mkdirMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: warnMock,
  attachConsole: vi.fn(),
}))

vi.mock('~/commands/fs', () => ({
  fsCmds: {
    deleteFile: deleteFileMock,
    copyDirectoryWithProgress: copyDirectoryWithProgressMock,
  },
}))

vi.mock('~/commands/game', () => ({
  findGameConfigEntryValue(entries: { key: string, value: string }[], rawKey: string) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]
      if (entry?.key === rawKey) {
        return entry.value
      }
    }
  },
  gameCmds: {
    getGameConfig: gameCmdsGetGameConfigMock,
    setGameConfig: gameCmdsSetGameConfigMock,
  },
}))

vi.mock('~/commands/project-config', () => ({
  projectConfigCmds: {
    readProjectConfig: readProjectConfigMock,
    writeProjectConfig: writeProjectConfigMock,
  },
}))

vi.mock('~/commands/vfs', () => ({
  vfsCmds: {
    ensureWritable: ensureWritableMock,
  },
}))

vi.mock('~/database/db', () => ({
  db: {
    engines: {
      get: dbEngineGetMock,
    },
    games: {
      add: dbGameAddMock,
      delete: dbGameDeleteMock,
      get: dbGameGetMock,
      toArray: dbGamesToArrayMock,
      update: dbGameUpdateMock,
      where: dbGameWhereMock,
    },
  },
}))

vi.mock('~/services/engine-manager', () => ({
  engineManager: {
    findEngineByRef: engineFindByRefMock,
  },
}))

vi.mock('~/services/template-switch', () => ({
  templateSwitch: {
    resolveTemplatePath: vi.fn(),
  },
}))

vi.mock('~/services/platform/app-paths', () => ({
  gameConfigPath: gameConfigPathMock,
  projectConfigPath: projectConfigPathMock,
  gameIconPath: vi.fn(async (gamePath: string) => `${gamePath}/icons/favicon.ico`),
  gameCoverPath: vi.fn(async (gamePath: string, fileName: string) => `${gamePath}/game/background/${fileName}`),
}))

vi.mock('~/stores/resource', () => ({
  useResourceStore: () => resourceStoreState,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: () => workspaceStoreState,
}))

vi.mock('~/plugins/i18n', () => ({
  i18n: {
    global: {
      t: vi.fn((key: string) => key),
    },
  },
}))

vi.mock('vue-sonner', () => ({
  toast: {
    warning: toastWarningMock,
  },
}))

function createGameConfig(entries: { key: string, value: string }[]) {
  return {
    entries,
    unmanagedLineCount: 0,
  }
}

describe('gameManager', () => {
  beforeEach(() => {
    dbEngineGetMock.mockReset()
    dbGameAddMock.mockReset()
    dbGameDeleteMock.mockReset()
    dbGameGetMock.mockReset()
    dbGamesToArrayMock.mockReset()
    dbGameUpdateMock.mockReset()
    dbGameWhereEqualsMock.mockReset()
    dbGameWhereFirstMock.mockReset()
    dbGameWhereMock.mockReset()
    deleteFileMock.mockReset()
    engineFindByRefMock.mockReset()
    ensureWritableMock.mockReset()
    existsMock.mockReset()
    gameCmdsGetGameConfigMock.mockReset()
    gameCmdsSetGameConfigMock.mockReset()
    gameConfigPathMock.mockReset()
    joinMock.mockClear()
    mkdirMock.mockReset()
    projectConfigPathMock.mockReset()
    resourceStoreState.finishProgress.mockReset()
    resourceStoreState.updateProgress.mockReset()
    readProjectConfigMock.mockReset()
    copyDirectoryWithProgressMock.mockReset()
    copyFileFsMock.mockReset()
    toastWarningMock.mockReset()
    warnMock.mockReset()
    writeProjectConfigMock.mockReset()
    workspaceStoreState.currentGame = undefined

    dbGameWhereMock.mockReturnValue({
      equals: dbGameWhereEqualsMock,
    })
    dbGameWhereEqualsMock.mockReturnValue({
      first: dbGameWhereFirstMock,
    })
    dbGameWhereFirstMock.mockResolvedValue(undefined)
    dbGameAddMock.mockResolvedValue('game-1')
    dbGameDeleteMock.mockResolvedValue(undefined)
    dbGamesToArrayMock.mockResolvedValue([])

    gameConfigPathMock.mockImplementation(async (gamePath: string) => `${gamePath}/game/config.txt`)
    projectConfigPathMock.mockImplementation(async (gamePath: string) => `${gamePath}/project.wgcp`)
    gameCmdsGetGameConfigMock.mockResolvedValue(createGameConfig([
      { key: 'Game_name', value: 'Demo Game' },
      { key: 'Title_img', value: 'cover.png' },
    ]))
    existsMock.mockResolvedValue(false)
    copyFileFsMock.mockResolvedValue(undefined)
    deleteFileMock.mockResolvedValue(undefined)
    ensureWritableMock.mockImplementation(async ({ enginePath, relPath }: { enginePath: string, relPath: string }) => `${enginePath}/${relPath}`)
    copyDirectoryWithProgressMock.mockResolvedValue(undefined)
  })

  it('validateGame 仅检查 game/config.txt 是否存在', async () => {
    existsMock.mockResolvedValue(true)

    await expect(gameManager.validateGame('/games/demo')).resolves.toBe(true)
    expect(gameConfigPathMock).toHaveBeenCalledWith('/games/demo')
  })

  it('getGameMetadata 只返回语义元数据', async () => {
    await expect(gameManager.getGameMetadata('/games/demo')).resolves.toEqual({
      name: 'Demo Game',
      titleImg: 'cover.png',
    })
  })

  it('getGamePreviewAssets 返回相对预览路径', async () => {
    await expect(gameManager.getGamePreviewAssets('/games/demo')).resolves.toEqual({
      icon: {
        path: 'icons/favicon.ico',
      },
      cover: {
        path: 'game/background/cover.png',
      },
    })
  })

  it('registerGame 会保留调用方提供的 metadata 并只补齐缺失的 previewAssets', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))

    await gameManager.registerGame('/games/demo', {
      metadata: {
        name: 'Provided Name',
      },
    })

    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        name: 'Provided Name',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: 'game/background/cover.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
    }))

    vi.useRealTimers()
  })

  it('getGameSnapshot 只持久化语义元数据，并返回相对预览路径', async () => {
    await expect(gameManager.getGameSnapshot('/games/demo')).resolves.toEqual({
      metadata: {
        name: 'Demo Game',
        titleImg: 'cover.png',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: expect.any(Number),
        },
        cover: {
          path: 'game/background/cover.png',
          cacheVersion: expect.any(Number),
        },
      },
    })
  })

  it('createGame 会先注册 creating 记录，再推进复制进度并完成快照写入', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      name: 'WebGAL',
      version: '4.5.0',
      path: '/engines/WebGAL/4.5.0',
    }))
    copyDirectoryWithProgressMock.mockImplementation(async (_from, _to, onProgress: (progress: number) => void) => {
      onProgress(48)
    })
    existsMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await expect(gameManager.createGame('Demo Game', '/games/demo', 'engine-1')).resolves.toBe('game-1')

    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      path: '/games/demo',
      engineId: 'engine-1',
      status: 'creating',
      metadata: {
        name: 'Demo Game',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
        },
        cover: {
          path: 'game/background/cover.png',
        },
      },
    }))
    expect(mkdirMock).toHaveBeenCalledWith('/games/demo/game', { recursive: true })
    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/demo', {
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.5.0',
      },
    })
    expect(gameCmdsSetGameConfigMock).toHaveBeenCalledWith('/games/demo', {
      entries: [
        { key: 'Game_name', value: 'Demo Game' },
        { key: 'Title_img', value: 'cover.png' },
        { key: 'Game_key', value: expect.any(String) },
      ],
    })
    expect(copyDirectoryWithProgressMock).toHaveBeenCalledWith(
      '/engines/WebGAL/4.5.0/game',
      '/games/demo/game',
      expect.any(Function),
      { excludes: ['template'] },
    )
    expect(resourceStoreState.updateProgress).toHaveBeenCalledWith('game-1', 48)
    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', {
      status: 'created',
      metadata: {
        name: 'Demo Game',
        titleImg: 'cover.png',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: expect.any(Number),
        },
        cover: {
          path: 'game/background/cover.png',
          cacheVersion: expect.any(Number),
        },
      },
    })
    expect(resourceStoreState.finishProgress).toHaveBeenCalledWith('game-1')
  })

  it('createGame 在同步复制失败时会清理生成目录', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      name: 'WebGAL',
      version: '4.5.0',
      path: '/engines/WebGAL/4.5.0',
    }))
    existsMock
      .mockResolvedValueOnce(false) // gamePath 不存在
      .mockResolvedValueOnce(true) // engineGameDir 存在
    copyDirectoryWithProgressMock.mockRejectedValue(new Error('copy failed'))
    existsMock.mockResolvedValueOnce(true) // 回滚时 gamePath 存在

    await expect(gameManager.createGame('Demo Game', '/games/demo', 'engine-1')).rejects.toThrow('copy failed')

    expect(dbGameDeleteMock).toHaveBeenCalledWith('game-1')
    expect(deleteFileMock).toHaveBeenCalledWith('/games/demo', true)
    expect(resourceStoreState.finishProgress).toHaveBeenCalledWith('game-1')
  })

  it('createGame 在失败且目标目录原本不存在时会清理生成目录', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      name: 'WebGAL',
      version: '4.5.0',
      path: '/engines/WebGAL/4.5.0',
    }))
    existsMock
      .mockResolvedValueOnce(false) // gamePath 不存在
      .mockResolvedValueOnce(true) // engineGameDir 存在
    gameCmdsSetGameConfigMock.mockRejectedValue(new Error('config failed'))
    existsMock.mockResolvedValueOnce(true) // 回滚时 gamePath 存在

    await expect(gameManager.createGame('Demo Game', '/games/demo', 'engine-1')).rejects.toThrow('config failed')

    expect(dbGameDeleteMock).toHaveBeenCalledWith('game-1')
    expect(deleteFileMock).toHaveBeenCalledWith('/games/demo', true)
    expect(resourceStoreState.finishProgress).toHaveBeenCalledWith('game-1')
  })

  it('renameGame 在引擎绑定项目中会先确保 config.txt 可写', async () => {
    dbGameGetMock.mockResolvedValue(createTestGame({
      id: 'game-1',
      engineId: 'engine-1',
      path: '/games/demo',
    }))
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      path: '/engines/WebGAL/4.5.0',
      name: 'WebGAL',
      version: '4.5.0',
    }))

    await gameManager.renameGame('game-1', 'Renamed Game')

    expect(ensureWritableMock).toHaveBeenCalledWith({
      projectPath: '/games/demo',
      enginePath: '/engines/WebGAL/4.5.0',
      relPath: 'game/config.txt',
    })
    expect(gameCmdsSetGameConfigMock).toHaveBeenCalledWith('/games/demo', {
      entries: [
        { key: 'Game_name', value: 'Renamed Game' },
        { key: 'Title_img', value: 'cover.png' },
      ],
    })
    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', {
      lastModified: expect.any(Number),
      metadata: {
        name: 'Renamed Game',
      },
    })
  })

  it('importGame 对自带引擎旧项目会补写自包含 project.wgcp', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    await expect(gameManager.importGame('/games/self-contained')).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/self-contained', { version: 1 })
    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      engineId: undefined,
      path: '/games/self-contained',
    }))
  })

  it('importGame 对匹配到本地引擎的配置项目会直接关联 engineId', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.5.0',
      },
    })
    engineFindByRefMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      name: 'WebGAL',
      version: '4.5.0',
    }))

    await expect(gameManager.importGame('/games/vfs')).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      engineId: 'engine-1',
      path: '/games/vfs',
    }))
  })

  it('importGame 对匹配到 broken availability 引擎的配置项目会保留关联并记录受限预览警告', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.5.0',
      },
    })
    engineFindByRefMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      name: 'WebGAL',
      version: '4.5.0',
      availability: 'broken',
    }))

    await expect(gameManager.importGame('/games/vfs')).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(writeProjectConfigMock).not.toHaveBeenCalled()
    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      engineId: 'engine-1',
      path: '/games/vfs',
    }))
    expect(warnMock).toHaveBeenCalledWith('关联的引擎 WebGAL 当前不可用，项目预览将受限: /games/vfs')
  })

  it('importGame 对匹配到 error 引擎的配置项目会回退到重新选择可用引擎', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.5.0',
      },
    })
    engineFindByRefMock.mockResolvedValue(createTestEngine({
      id: 'engine-error',
      name: 'WebGAL',
      version: '4.5.0',
      status: 'error',
    }))
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-2',
      name: 'WebGAL',
      version: '4.6.0',
      status: 'created',
    }))

    await expect(gameManager.importGame('/games/vfs', {
      selectEngine: vi.fn().mockResolvedValue('engine-2'),
    })).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/vfs', {
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.6.0',
      },
    })
    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      engineId: 'engine-2',
      path: '/games/vfs',
    }))
  })

  it('importGame 在未匹配到引擎时会请求用户选择并更新 project.wgcp', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.5.0',
      },
    })
    engineFindByRefMock.mockResolvedValue(undefined)
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-2',
      name: 'WebGAL',
      version: '4.6.0',
      status: 'created',
    }))

    await expect(gameManager.importGame('/games/vfs', {
      selectEngine: vi.fn().mockResolvedValue('engine-2'),
    })).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/vfs', {
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.6.0',
      },
    })
    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      engineId: 'engine-2',
    }))
  })

  it('importGame 遇到已注册项目时会幂等返回既有 ID', async () => {
    existsMock.mockResolvedValue(true)
    dbGamesToArrayMock.mockResolvedValue([createTestGame({
      id: 'game-existing',
      path: '/games/demo',
    })])

    await expect(gameManager.importGame('/games/demo')).resolves.toEqual({
      id: 'game-existing',
      alreadyRegistered: true,
    })
    expect(dbGameAddMock).not.toHaveBeenCalled()
  })

  it('importGame 对大小写不同但归一化相同的路径也会幂等返回既有 ID', async () => {
    existsMock.mockResolvedValue(true)
    dbGamesToArrayMock.mockResolvedValue([createTestGame({
      id: 'game-existing',
      path: '/Games/Demo',
    })])

    await expect(gameManager.importGame('/games/demo')).resolves.toEqual({
      id: 'game-existing',
      alreadyRegistered: true,
    })
    expect(dbGameAddMock).not.toHaveBeenCalled()
  })

  it('importGame 在用户取消选择引擎时会返回取消原因', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)

    await expect(gameManager.importGame('/games/no-engine', {
      selectEngine: vi.fn().mockResolvedValue(undefined),
    })).rejects.toEqual(
      new AppError('IO_ERROR', '导入已取消', {
        details: { reason: 'IMPORT_CANCELLED' },
      }),
    )
  })

  it('importGame 对损坏且无法恢复的 project.wgcp 返回配置损坏原因', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    readProjectConfigMock.mockRejectedValue(new AppError('INVALID_PROJECT_CONFIG', 'project.wgcp 损坏'))

    await expect(gameManager.importGame('/games/broken-config')).rejects.toEqual(
      new AppError('INVALID_PROJECT_CONFIG', '项目配置文件损坏', {
        details: { reason: 'CONFIG_CORRUPTED' },
      }),
    )
  })

  it('importGame 不会把非配置解析错误伪装成配置损坏', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
    readProjectConfigMock.mockRejectedValue(new AppError('IO_ERROR', '权限不足'))

    await expect(gameManager.importGame('/games/io-error')).rejects.toEqual(
      new AppError('IO_ERROR', '权限不足'),
    )
  })

  it('resolvePreviewSite 会返回游戏路径与已解析的引擎路径', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      path: '/engines/WebGAL/4.5.0',
    }))

    await expect(gameManager.resolvePreviewSite({
      path: '/games/demo',
      engineId: 'engine-1',
    })).resolves.toEqual({
      projectPath: '/games/demo',
      enginePath: '/engines/WebGAL/4.5.0',
    })
  })

  it('getGameEnginePath 会忽略 broken availability 引擎，允许回退为仅编辑本地 game 目录', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      path: '/engines/WebGAL/4.5.0',
      availability: 'broken',
    }))

    await expect(gameManager.getGameEnginePath({
      path: '/games/demo',
      engineId: 'engine-1',
    })).resolves.toBeUndefined()
  })

  it('resolvePreviewSite 会在引擎绑定项目的引擎不可用时直接拒绝预览', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      path: '/engines/WebGAL/4.5.0',
      availability: 'broken',
    }))
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.5.0',
      },
    })

    await expect(gameManager.resolvePreviewSite({
      path: '/games/demo',
      engineId: 'engine-1',
    })).rejects.toEqual(new AppError('IO_ERROR', '引擎不可用'))
  })

  it('importGame 遇到无效目录时抛出 INVALID_STRUCTURE', async () => {
    existsMock.mockResolvedValue(false)

    await expect(gameManager.importGame('/games/invalid')).rejects.toEqual(
      new AppError('INVALID_STRUCTURE', '无效的游戏文件夹'),
    )
  })

  it('inspectGame 在路径不存在时返回 missing + DIR_NOT_FOUND', async () => {
    existsMock.mockResolvedValue(false)

    await expect(gameManager.inspectGame('/games/missing')).resolves.toMatchObject({
      availability: 'missing',
      warnings: [],
      blockingIssue: { code: 'DIR_NOT_FOUND' },
    })
  })

  it('inspectGame 在缺失 game/config.txt 时返回 broken + INVALID_STRUCTURE', async () => {
    existsMock.mockImplementation(async (path: string) => path === '/games/demo')

    await expect(gameManager.inspectGame('/games/demo')).resolves.toMatchObject({
      availability: 'broken',
      blockingIssue: { code: 'INVALID_STRUCTURE' },
    })
  })

  it('inspectGame 在 gameName 为空时返回 broken + INVALID_CONFIG', async () => {
    existsMock.mockResolvedValue(true)
    gameCmdsGetGameConfigMock.mockResolvedValue(createGameConfig([
      { key: 'Game_name', value: '' },
      { key: 'Title_img', value: 'cover.png' },
    ]))

    await expect(gameManager.inspectGame('/games/demo')).resolves.toMatchObject({
      availability: 'broken',
      blockingIssue: { code: 'INVALID_CONFIG' },
    })
  })

  it('inspectGame 在 favicon 缺失时只产 warning', async () => {
    existsMock.mockImplementation(async (path: string) => path !== '/games/demo/icons/favicon.ico')

    await expect(gameManager.inspectGame('/games/demo')).resolves.toMatchObject({
      availability: 'available',
      warnings: [{ code: 'missing-favicon' }],
    })
  })

  it('inspectGame 在 titleImg 为空时产 missing-title-image warning', async () => {
    existsMock.mockResolvedValue(true)
    gameCmdsGetGameConfigMock.mockResolvedValue(createGameConfig([
      { key: 'Game_name', value: 'Demo Game' },
      { key: 'Title_img', value: '' },
    ]))

    await expect(gameManager.inspectGame('/games/demo')).resolves.toMatchObject({
      availability: 'available',
      warnings: [{ code: 'missing-title-image' }],
    })
  })

  it('inspectGame 在 titleImg 文件不存在时产 missing-title-image-file warning', async () => {
    existsMock.mockImplementation(async (path: string) => path !== '/games/demo/game/background/cover.png')

    await expect(gameManager.inspectGame('/games/demo')).resolves.toMatchObject({
      availability: 'available',
      warnings: [{ code: 'missing-title-image-file' }],
    })
  })

  it('refreshRegisteredGameSnapshot 会按路径刷新数据库快照，并同步当前工作区游戏', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
    dbGameWhereFirstMock.mockResolvedValue(createTestGame({
      id: 'game-1',
      path: '/games/demo',
      metadata: {
        name: 'Old Name',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/cover-old.png',
          cacheVersion: 222,
        },
      },
    }))
    gameCmdsGetGameConfigMock.mockResolvedValue(createGameConfig([
      { key: 'Game_name', value: 'Renamed Game' },
      { key: 'Title_img', value: 'cover-next.png' },
    ]))
    workspaceStoreState.currentGame = createTestGame({
      id: 'game-1',
      path: '/games/demo',
      metadata: {
        name: 'Old Name',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/cover-old.png',
          cacheVersion: 222,
        },
      },
    })

    await gameManager.refreshRegisteredGameSnapshot('/games/demo')

    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', {
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
      metadata: {
        name: 'Renamed Game',
        titleImg: 'cover-next.png',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: 'game/background/cover-next.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
    })
    expect(workspaceStoreState.currentGame).toMatchObject({
      id: 'game-1',
      path: '/games/demo',
      metadata: {
        name: 'Renamed Game',
        titleImg: 'cover-next.png',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: 'game/background/cover-next.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
    })

    vi.useRealTimers()
  })

  it('deleteGame 在 removeFiles=true 时会通过 fs 命令删除游戏目录后再删除记录', async () => {
    await gameManager.deleteGame(createTestGame({
      id: 'game-1',
      path: '/games/demo',
    }), true)

    expect(deleteFileMock).toHaveBeenCalledWith('/games/demo')
    expect(dbGameDeleteMock).toHaveBeenCalledWith('game-1')
    expect(deleteFileMock.mock.invocationCallOrder[0]).toBeLessThan(
      dbGameDeleteMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
  })

  it('updateGameLastModified 会刷新预览资源快照与缓存版本', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
    workspaceStoreState.currentGame = createTestGame({
      id: 'game-1',
      path: '/games/demo',
      metadata: {
        name: 'Demo',
      },
      previewAssets: {
        icon: {
          path: 'icons/current.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/current-cover.png',
          cacheVersion: 222,
        },
      },
    })
    dbGameGetMock.mockResolvedValue(createTestGame({
      id: 'game-1',
      path: '/games/demo',
      metadata: {
        name: 'Demo',
      },
      previewAssets: {
        icon: {
          path: 'icons/current.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/current-cover.png',
          cacheVersion: 222,
        },
      },
    }))
    gameCmdsGetGameConfigMock.mockResolvedValue(createGameConfig([
      { key: 'Game_name', value: 'Changed Name' },
      { key: 'Title_img', value: 'cover-next.png' },
    ]))

    await gameManager.updateGameLastModified('game-1')

    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', {
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: 'game/background/cover-next.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
    })
    expect(workspaceStoreState.currentGame).toEqual({
      id: 'game-1',
      path: '/games/demo',
      createdAt: 0,
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
      status: 'created',
      availability: 'available',
      metadata: {
        name: 'Demo',
        titleImg: 'cover.png',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: 'game/background/cover-next.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
    })

    vi.useRealTimers()
  })

  it('updateGameLastModified 在游戏记录不存在时不会继续更新数据库或当前工作区状态', async () => {
    dbGameGetMock.mockResolvedValue(undefined)

    await gameManager.updateGameLastModified('game-1')

    expect(dbGameUpdateMock).not.toHaveBeenCalled()
    expect(workspaceStoreState.currentGame).toBeUndefined()
  })

  it('updateGameLastModified 在预览资源解析失败时仍会推进预览缓存版本', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
    dbGameGetMock.mockResolvedValue(createTestGame({
      id: 'game-1',
      path: '/games/demo',
      previewAssets: {
        icon: {
          path: 'icons/current.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/current-cover.png',
          cacheVersion: 222,
        },
      },
    }))
    workspaceStoreState.currentGame = createTestGame({
      id: 'game-1',
      path: '/games/demo',
      previewAssets: {
        icon: {
          path: 'icons/current.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/current-cover.png',
          cacheVersion: 222,
        },
      },
    })
    gameCmdsGetGameConfigMock.mockRejectedValue(new Error('config missing'))

    await gameManager.updateGameLastModified('game-1')

    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', {
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
      previewAssets: {
        icon: {
          path: 'icons/current.ico',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: 'game/background/current-cover.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
    })
    expect(warnMock).toHaveBeenCalledWith('刷新游戏预览资源快照失败: Error: config missing')

    vi.useRealTimers()
  })

  it('updateCurrentGameLastModified 会按 500ms 防抖更新当前游戏', async () => {
    vi.useFakeTimers()
    workspaceStoreState.currentGame = createTestGame({
      id: 'game-1',
      path: '/games/demo',
    })
    dbGameGetMock.mockResolvedValue(createTestGame({
      id: 'game-1',
      path: '/games/demo',
    }))

    gameManager.updateCurrentGameLastModified()
    gameManager.updateCurrentGameLastModified()

    expect(dbGameUpdateMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)

    expect(dbGameUpdateMock).toHaveBeenCalledTimes(1)
    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', expect.objectContaining({
      lastModified: expect.any(Number),
    }))

    vi.useRealTimers()
  })
})
