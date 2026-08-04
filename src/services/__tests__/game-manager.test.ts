import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine, createTestGame, createTestTemplate } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'
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
  dbTransactionMock,
  dbGameWhereEqualsMock,
  dbGameWhereFirstMock,
  dbGameWhereMock,
  dbTemplateWhereEqualsMock,
  dbTemplateWhereFirstMock,
  dbTemplateWhereMock,
  deleteFileMock,
  engineFindByRefMock,
  ensureWritableMock,
  existsMock,
  gameCmdsGetGameConfigMock,
  gameCmdsSetGameConfigMock,
  gameConfigPathMock,
  mkdirMock,
  projectConfigPathMock,
  resourceStoreState,
  readProjectConfigMock,
  resolvePathMock,
  resolveTemplatePathMock,
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
  dbTransactionMock: vi.fn(),
  dbGameWhereEqualsMock: vi.fn(),
  dbGameWhereFirstMock: vi.fn(),
  dbGameWhereMock: vi.fn(),
  dbTemplateWhereEqualsMock: vi.fn(),
  dbTemplateWhereFirstMock: vi.fn(),
  dbTemplateWhereMock: vi.fn(),
  deleteFileMock: vi.fn(),
  engineFindByRefMock: vi.fn(),
  ensureWritableMock: vi.fn(),
  existsMock: vi.fn(),
  gameCmdsGetGameConfigMock: vi.fn(),
  gameCmdsSetGameConfigMock: vi.fn(),
  gameConfigPathMock: vi.fn(),
  mkdirMock: vi.fn(),
  projectConfigPathMock: vi.fn(),
  resourceStoreState: {
    finishProgress: vi.fn(),
    updateProgress: vi.fn(),
  },
  readProjectConfigMock: vi.fn(),
  resolvePathMock: vi.fn(),
  resolveTemplatePathMock: vi.fn(),
  toastWarningMock: vi.fn(),
  warnMock: vi.fn(),
  writeProjectConfigMock: vi.fn(),
  workspaceStoreState: {
    currentGame: undefined as ReturnType<typeof createTestGame> | undefined,
  },
}))

function mockExistingPaths(...paths: string[]) {
  existsMock.mockImplementation(async (path: string) => paths.includes(path))
}

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
    resolvePath: resolvePathMock,
  },
}))

vi.mock('~/database/db', () => ({
  db: {
    engines: {
      get: dbEngineGetMock,
    },
    templates: {
      where: dbTemplateWhereMock,
    },
    games: {
      add: dbGameAddMock,
      delete: dbGameDeleteMock,
      get: dbGameGetMock,
      toArray: dbGamesToArrayMock,
      update: dbGameUpdateMock,
      where: dbGameWhereMock,
    },
    transaction: dbTransactionMock,
  },
}))

vi.mock('~/services/engine-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/services/engine-manager')>()

  return {
    ...actual,
    engineManager: {
      ...actual.engineManager,
      findEngineByRef: engineFindByRefMock,
    },
  }
})

vi.mock('~/services/template-switch', () => ({
  templateSwitch: {
    resolveTemplatePath: resolveTemplatePathMock,
  },
}))

vi.mock('~/services/platform/app-paths', () => ({
  gameConfigPath: gameConfigPathMock,
  projectConfigPath: projectConfigPathMock,
  gameIconPath: vi.fn((gamePath: string) => `${gamePath}/icons/favicon.ico`),
  gameCoverPath: vi.fn((gamePath: string, fileName: string) => `${gamePath}/game/background/${fileName}`),
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

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolve_) => {
    resolve = resolve_
  })
  return { promise, resolve }
}

function mockTemplateLookupByName(templates: Record<string, ReturnType<typeof createTestTemplate> | undefined>) {
  dbTemplateWhereMock.mockReturnValue({
    equals: (name: string) => ({
      first: async () => templates[name],
    }),
  })
}

const importedProjectEngineRef = {
  id: 'default-publisher.default-engine',
  version: '4.6.2',
}

const selectedProjectEngineRef = {
  id: 'default-publisher.default-engine',
  version: '4.6.2',
}

const configuredImportDependencyContext = {
  gameName: 'Demo Game',
  purpose: 'import',
  source: 'configured',
} as const

const legacyImportDependencyContext = {
  gameName: 'Demo Game',
  purpose: 'import',
  source: 'legacy',
  engine: {
    reason: 'selectionRequired',
  },
} as const

describe('gameManager', () => {
  beforeEach(() => {
    dbEngineGetMock.mockReset()
    dbGameAddMock.mockReset()
    dbGameDeleteMock.mockReset()
    dbGameGetMock.mockReset()
    dbGamesToArrayMock.mockReset()
    dbGameUpdateMock.mockReset()
    dbTransactionMock.mockReset()
    dbGameWhereEqualsMock.mockReset()
    dbGameWhereFirstMock.mockReset()
    dbGameWhereMock.mockReset()
    dbTemplateWhereEqualsMock.mockReset()
    dbTemplateWhereFirstMock.mockReset()
    dbTemplateWhereMock.mockReset()
    deleteFileMock.mockReset()
    engineFindByRefMock.mockReset()
    ensureWritableMock.mockReset()
    existsMock.mockReset()
    gameCmdsGetGameConfigMock.mockReset()
    gameCmdsSetGameConfigMock.mockReset()
    gameConfigPathMock.mockReset()
    mkdirMock.mockReset()
    projectConfigPathMock.mockReset()
    resourceStoreState.finishProgress.mockReset()
    resourceStoreState.updateProgress.mockReset()
    readProjectConfigMock.mockReset()
    resolvePathMock.mockReset()
    resolveTemplatePathMock.mockReset()
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
    dbTemplateWhereMock.mockReturnValue({
      equals: dbTemplateWhereEqualsMock,
    })
    dbTemplateWhereEqualsMock.mockReturnValue({
      first: dbTemplateWhereFirstMock,
    })
    dbGameWhereFirstMock.mockResolvedValue(undefined)
    dbTemplateWhereFirstMock.mockResolvedValue(undefined)
    dbGameAddMock.mockResolvedValue('game-1')
    dbGameDeleteMock.mockResolvedValue(undefined)
    dbGamesToArrayMock.mockResolvedValue([])
    dbTransactionMock.mockImplementation(async (_mode: string, _table: unknown, scope: () => unknown) => scope())

    gameConfigPathMock.mockImplementation((gamePath: string) => `${gamePath}/game/config.txt`)
    projectConfigPathMock.mockImplementation((gamePath: string) => `${gamePath}/project.wgcp`)
    gameCmdsGetGameConfigMock.mockResolvedValue(createGameConfig([
      { key: 'Game_name', value: 'Demo Game' },
      { key: 'Title_img', value: 'cover.png' },
    ]))
    existsMock.mockResolvedValue(false)
    copyFileFsMock.mockResolvedValue(undefined)
    deleteFileMock.mockResolvedValue(undefined)
    ensureWritableMock.mockImplementation(async ({ enginePath, relPath }: { enginePath: string, relPath: string }) => `${enginePath}/${relPath}`)
    resolvePathMock.mockRejectedValue(new AppError('NOT_FOUND', '文件未找到'))
    copyDirectoryWithProgressMock.mockResolvedValue(undefined)
    resolveTemplatePathMock.mockResolvedValue(undefined)
  })

  it('validateGame 仅检查 game/config.txt 是否存在', async () => {
    existsMock.mockResolvedValue(true)

    await expect(gameManager.validateGame(AbsPath.from('/games/demo'))).resolves.toBe(true)
    expect(gameConfigPathMock).toHaveBeenCalledWith('/games/demo')
  })

  it('managed import 预检只读、为每次选择生成独立目录，并在发布后注册而不复制', async () => {
    mockExistingPaths(
      '/games/.import-staging/session',
      '/games/.import-staging/session/game/config.txt',
    )
    dbGameAddMock.mockResolvedValue('game-managed')
    dbEngineGetMock.mockResolvedValue(createTestEngine({ id: 'engine-1' }))
    const resolveDependencies = vi.fn().mockResolvedValue({ engineId: 'engine-1' })

    const firstResult = await gameManager.prepareManagedImport(
      AbsPath.from('/games/.import-staging/session'),
    )
    const secondResult = await gameManager.prepareManagedImport(
      AbsPath.from('/games/.import-staging/session'),
    )

    expect(firstResult).toMatchObject({ kind: 'ready' })
    expect(secondResult).toMatchObject({ kind: 'ready' })

    if (firstResult.kind !== 'ready' || secondResult.kind !== 'ready') {
      throw new Error('expected both managed imports to be ready')
    }
    expect(firstResult.prepared.finalRelativePath).toMatch(
      /^[0-9a-f-]{36}$/,
    )
    expect(secondResult.prepared.finalRelativePath).toMatch(
      /^[0-9a-f-]{36}$/,
    )
    expect(firstResult.prepared.finalRelativePath).not.toBe(secondResult.prepared.finalRelativePath)
    expect(dbGameAddMock).not.toHaveBeenCalled()
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
    expect(writeProjectConfigMock).not.toHaveBeenCalled()

    await expect(gameManager.registerManagedImport(
      AbsPath.from('/games/imported-game'),
      firstResult.prepared,
      { resolveDependencies },
    )).resolves.toEqual({ id: 'game-managed' })

    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.any(String),
      path: '/games/imported-game',
    }))
  })

  it('getGameMetadata 只返回语义元数据', async () => {
    await expect(gameManager.getGameMetadata(AbsPath.from('/games/demo'))).resolves.toEqual({
      name: 'Demo Game',
      titleImg: 'cover.png',
    })
  })

  it('getGamePreviewAssets 返回相对预览路径', async () => {
    await expect(gameManager.getGamePreviewAssets(AbsPath.from('/games/demo'))).resolves.toEqual({
      icon: {
        path: 'icons/favicon.ico',
      },
      cover: {
        path: 'game/background/cover.png',
      },
    })
  })

  it('getGamePreviewAssets 按既定候选顺序解析图标', async () => {
    existsMock.mockImplementation(async (path: string) => path === '/games/demo/icons/icon-192.png')

    await expect(gameManager.getGamePreviewAssets(AbsPath.from('/games/demo'))).resolves.toEqual({
      icon: {
        path: 'icons/icon-192.png',
      },
      cover: {
        path: 'game/background/cover.png',
      },
    })
  })

  it('getGamePreviewAssets 会通过 VFS overlay 解析引擎绑定项目的图标', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      path: AbsPath.from('/engines/WebGAL/4.5.0'),
    }))
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: importedProjectEngineRef,
    })
    engineFindByRefMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      path: AbsPath.from('/engines/WebGAL/4.5.0'),
    }))
    resolveTemplatePathMock.mockResolvedValue(AbsPath.from('/engines/WebGAL/4.5.0/game/template'))
    resolvePathMock.mockImplementation(async ({ relPath }: { relPath: string }) => {
      if (relPath === 'icons/icon-192.png') {
        return AbsPath.from('/engines/WebGAL/4.5.0/icons/icon-192.png')
      }
      throw new AppError('NOT_FOUND', '文件未找到')
    })

    await expect(gameManager.getGamePreviewAssets(AbsPath.from('/games/vfs'))).resolves.toEqual({
      icon: {
        path: 'icons/icon-192.png',
      },
      cover: {
        path: 'game/background/cover.png',
      },
    })

    expect(resolvePathMock).toHaveBeenCalledWith({
      projectPath: '/games/vfs',
      enginePath: '/engines/WebGAL/4.5.0',
      templatePath: '/engines/WebGAL/4.5.0/game/template',
      relPath: 'icons/icon-192.png',
    })
    expect(existsMock).not.toHaveBeenCalledWith('/games/vfs/icons/icon-192.png')
  })

  it('getGamePreviewAssets 在绑定引擎不兼容时仍按项目静态资源解析图标', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-legacy',
      metadata: { webgalVersion: '4.6.0' },
      path: AbsPath.from('/engines/WebGAL/4.6.0'),
    }))
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.6.0',
      },
    })
    existsMock.mockImplementation(async (path: string) => path === '/games/vfs/icons/icon-192.png')

    await expect(gameManager.getGamePreviewAssets(AbsPath.from('/games/vfs'))).resolves.toEqual({
      icon: {
        path: 'icons/icon-192.png',
      },
      cover: {
        path: 'game/background/cover.png',
      },
    })

    expect(resolvePathMock).not.toHaveBeenCalled()
  })

  it('registerGame 会保留调用方提供的 metadata 并只补齐缺失的 previewAssets', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))

    await gameManager.registerGame(AbsPath.from('/games/demo'), {
      metadata: {
        name: 'Provided Name',
      },
    })

    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        name: 'Provided Name',
      },
      pathLookupKey: '/games/demo',
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
    await expect(gameManager.getGameSnapshot(AbsPath.from('/games/demo'))).resolves.toEqual({
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
      path: AbsPath.from('/engines/WebGAL/4.5.0'),
    }))
    copyDirectoryWithProgressMock.mockImplementation(async (_from, _to, onProgress: (progress: number) => void) => {
      onProgress(48)
    })
    existsMock.mockImplementation(async (path: string) => {
      if (path === '/games/demo') {
        return false
      }
      if (path === '/engines/WebGAL/4.5.0/game') {
        return true
      }
      if (path === '/engines/WebGAL/4.5.0/icons/icon-192.png') {
        return true
      }
      if (path.startsWith('/engines/WebGAL/4.5.0/icons/')) {
        return false
      }
      if (path.startsWith('/games/demo/icons/')) {
        return false
      }
      return false
    })

    await expect(gameManager.createGame('Demo Game', AbsPath.from('/games/demo'), 'engine-1')).resolves.toBe('game-1')

    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      path: '/games/demo',
      pathLookupKey: '/games/demo',
      engineId: 'engine-1',
      status: 'creating',
      metadata: {
        name: 'Demo Game',
      },
      previewAssets: {
        icon: {
          path: 'icons/icon-192.png',
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

  it('createGame 会拒绝不能作为编辑器运行时的引擎', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-legacy',
      name: 'WebGAL',
      version: '4.6.0',
      metadata: { webgalVersion: '4.6.0' },
    }))

    await expect(gameManager.createGame('Demo Game', AbsPath.from('/games/demo'), 'engine-legacy')).rejects.toMatchObject({
      code: 'ENGINE_EDITOR_INCOMPATIBLE',
      details: {
        issue: 'versionTooOld',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    })

    expect(mkdirMock).not.toHaveBeenCalled()
    expect(writeProjectConfigMock).not.toHaveBeenCalled()
    expect(dbGameAddMock).not.toHaveBeenCalled()
  })

  it('createGame 会把不可用引擎报告为编辑器运行时不兼容', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      availability: 'broken',
      id: 'engine-broken',
      metadata: { webgalVersion: '4.6.2' },
      name: 'WebGAL',
      version: '4.6.2',
    }))

    await expect(gameManager.createGame('Demo Game', AbsPath.from('/games/demo'), 'engine-broken')).rejects.toMatchObject({
      code: 'ENGINE_EDITOR_INCOMPATIBLE',
      details: {
        issue: 'unavailable',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    })

    expect(mkdirMock).not.toHaveBeenCalled()
    expect(writeProjectConfigMock).not.toHaveBeenCalled()
    expect(dbGameAddMock).not.toHaveBeenCalled()
  })

  it('createGame 会把 Windows 风格项目路径归一化后再创建目录', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      name: 'WebGAL',
      version: '4.5.0',
      path: AbsPath.from(String.raw`C:\Engines\WebGAL\4.5.0`),
    }))
    existsMock.mockImplementation(async (path: string) => {
      if (path === 'C:/Engines/WebGAL/4.5.0/game') {
        return true
      }
      if (path === 'C:/Engines/WebGAL/4.5.0/icons/icon-192.png') {
        return true
      }
      return false
    })

    await gameManager.createGame('Demo Game', AbsPath.from(String.raw`C:\Games\Demo`), 'engine-1')

    expect(mkdirMock).toHaveBeenCalledWith('C:/Games/Demo/game', { recursive: true })
    expect(copyDirectoryWithProgressMock).toHaveBeenCalledWith(
      'C:/Engines/WebGAL/4.5.0/game',
      'C:/Games/Demo/game',
      expect.any(Function),
      { excludes: ['template'] },
    )
  })

  it('createGame 在同步复制失败时会清理生成目录', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      name: 'WebGAL',
      version: '4.5.0',
      path: AbsPath.from('/engines/WebGAL/4.5.0'),
    }))
    let gamePathChecks = 0
    existsMock.mockImplementation(async (path: string) => {
      if (path === '/games/demo') {
        gamePathChecks += 1
        return gamePathChecks > 1
      }
      if (path === '/engines/WebGAL/4.5.0/game') {
        return true
      }
      if (path === '/engines/WebGAL/4.5.0/icons/icon-192.png') {
        return true
      }
      if (path.startsWith('/engines/WebGAL/4.5.0/icons/')) {
        return false
      }
      if (path.startsWith('/games/demo/icons/')) {
        return false
      }
      return false
    })
    copyDirectoryWithProgressMock.mockRejectedValue(new Error('copy failed'))

    await expect(gameManager.createGame('Demo Game', AbsPath.from('/games/demo'), 'engine-1')).rejects.toThrow('copy failed')

    expect(dbGameDeleteMock).toHaveBeenCalledWith('game-1')
    expect(deleteFileMock).toHaveBeenCalledWith('/games/demo', true)
    expect(resourceStoreState.finishProgress).toHaveBeenCalledWith('game-1')
  })

  it('createGame 在失败且目标目录原本不存在时会清理生成目录', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      name: 'WebGAL',
      version: '4.5.0',
      path: AbsPath.from('/engines/WebGAL/4.5.0'),
    }))
    let gamePathChecks = 0
    existsMock.mockImplementation(async (path: string) => {
      if (path === '/games/demo') {
        gamePathChecks += 1
        return gamePathChecks > 1
      }
      if (path === '/engines/WebGAL/4.5.0/game') {
        return true
      }
      if (path === '/engines/WebGAL/4.5.0/icons/icon-192.png') {
        return true
      }
      if (path.startsWith('/engines/WebGAL/4.5.0/icons/')) {
        return false
      }
      if (path.startsWith('/games/demo/icons/')) {
        return false
      }
      return false
    })
    gameCmdsSetGameConfigMock.mockRejectedValue(new Error('config failed'))

    await expect(gameManager.createGame('Demo Game', AbsPath.from('/games/demo'), 'engine-1')).rejects.toThrow('config failed')

    expect(dbGameDeleteMock).toHaveBeenCalledWith('game-1')
    expect(deleteFileMock).toHaveBeenCalledWith('/games/demo', true)
    expect(resourceStoreState.finishProgress).toHaveBeenCalledWith('game-1')
  })

  it('renameGame 在引擎绑定项目中会先确保 config.txt 可写', async () => {
    dbGameGetMock.mockResolvedValue(createTestGame({
      id: 'game-1',
      engineId: 'engine-1',
      path: AbsPath.from('/games/demo'),
    }))
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      path: AbsPath.from('/engines/WebGAL/4.5.0'),
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

  it('importGame 对带自带引擎入口的旧项目会要求选择兼容引擎并写入 project.wgcp', async () => {
    mockExistingPaths(
      '/games/self-contained',
      '/games/self-contained/game/config.txt',
      '/games/self-contained/index.html',
      '/games/self-contained/game/background/cover.png',
    )
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-2',
      name: 'WebGAL',
      version: '4.6.2',
      status: 'created',
    }))
    const resolveDependencies = vi.fn().mockResolvedValue({
      engineId: 'engine-2',
    })

    await expect(gameManager.importGame(AbsPath.from('/games/self-contained'), {
      resolveDependencies,
    })).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(resolveDependencies).toHaveBeenCalledWith(legacyImportDependencyContext)
    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/self-contained', {
      version: 1,
      engine: selectedProjectEngineRef,
    })
    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      engineId: 'engine-2',
      path: '/games/self-contained',
      pathLookupKey: '/games/self-contained',
    }))
  })

  it('importGame 对匹配到本地引擎的配置项目会直接关联 engineId', async () => {
    mockExistingPaths(
      '/games/vfs',
      '/games/vfs/game/config.txt',
      '/games/vfs/project.wgcp',
      '/games/vfs/game/background/cover.png',
    )
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: importedProjectEngineRef,
    })
    engineFindByRefMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      name: 'WebGAL',
      version: '4.6.2',
    }))

    await expect(gameManager.importGame(AbsPath.from('/games/vfs'))).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      engineId: 'engine-1',
      path: '/games/vfs',
      pathLookupKey: '/games/vfs',
    }))
  })

  it('importGame 对匹配到协议不兼容引擎的配置项目会请求用户重选兼容引擎', async () => {
    mockExistingPaths(
      '/games/vfs',
      '/games/vfs/game/config.txt',
      '/games/vfs/project.wgcp',
      '/games/vfs/game/background/cover.png',
    )
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: importedProjectEngineRef,
    })
    engineFindByRefMock.mockResolvedValue(createTestEngine({
      id: 'engine-old',
      name: 'WebGAL',
      version: '4.6.0',
      metadata: { webgalVersion: '4.6.0' },
    }))
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-2',
      name: 'WebGAL',
      version: '4.6.2',
      status: 'created',
    }))
    const resolveDependencies = vi.fn().mockResolvedValue({
      engineId: 'engine-2',
    })

    await expect(gameManager.importGame(AbsPath.from('/games/vfs'), {
      resolveDependencies,
    })).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(resolveDependencies).toHaveBeenCalledWith({
      ...configuredImportDependencyContext,
      engine: {
        compatibilityIssue: 'versionTooOld',
        current: importedProjectEngineRef,
        reason: 'incompatible',
      },
    })
    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/vfs', {
      version: 1,
      engine: selectedProjectEngineRef,
    })
    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      engineId: 'engine-2',
      path: '/games/vfs',
      pathLookupKey: '/games/vfs',
    }))
  })

  it('importGame 会在引用 standalone 模板缺失时请求选择可用模板并更新 project.wgcp', async () => {
    mockExistingPaths(
      '/games/vfs',
      '/games/vfs/game/config.txt',
      '/games/vfs/project.wgcp',
      '/games/vfs/game/background/cover.png',
    )
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: importedProjectEngineRef,
      template: {
        kind: 'standalone',
        name: 'Modern Template',
      },
    })
    engineFindByRefMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      name: 'WebGAL',
      version: '4.6.2',
    }))
    resolveTemplatePathMock.mockResolvedValue(undefined)
    const selectedTemplateBinding = {
      kind: 'standalone',
      name: 'Available Template',
    } as const
    mockTemplateLookupByName({
      'Available Template': createTestTemplate({
        metadata: {
          name: 'Available Template',
        },
      }),
    })
    const resolveDependencies = vi.fn().mockResolvedValue({
      template: { action: 'set', binding: selectedTemplateBinding },
    })

    await expect(gameManager.importGame(AbsPath.from('/games/vfs'), {
      resolveDependencies,
    })).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(resolveDependencies).toHaveBeenCalledOnce()
    expect(resolveDependencies).toHaveBeenCalledWith({
      ...configuredImportDependencyContext,
      resolvedEngineId: 'engine-1',
      template: {
        current: {
          kind: 'standalone',
          name: 'Modern Template',
        },
        displayName: 'Modern Template',
        reason: 'missing',
      },
    })
    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/vfs', {
      version: 1,
      engine: importedProjectEngineRef,
      template: selectedTemplateBinding,
    })
    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      engineId: 'engine-1',
      path: '/games/vfs',
      pathLookupKey: '/games/vfs',
    }))
  })

  it('importGame 在用户取消选择模板时会返回取消原因', async () => {
    mockExistingPaths(
      '/games/vfs',
      '/games/vfs/game/config.txt',
      '/games/vfs/project.wgcp',
      '/games/vfs/game/background/cover.png',
    )
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: importedProjectEngineRef,
      template: {
        kind: 'standalone',
        name: 'Modern Template',
      },
    })
    engineFindByRefMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      name: 'WebGAL',
      version: '4.5.0',
    }))
    resolveTemplatePathMock.mockResolvedValue(undefined)

    await expect(gameManager.importGame(AbsPath.from('/games/vfs'), {
      resolveDependencies: vi.fn().mockResolvedValue(undefined),
    })).rejects.toEqual(
      new AppError('IO_ERROR', '导入已取消', {
        details: { reason: 'IMPORT_CANCELLED' },
      }),
    )

    expect(writeProjectConfigMock).not.toHaveBeenCalled()
    expect(dbGameAddMock).not.toHaveBeenCalled()
  })

  it('importGame 会在引用 engineBuiltin 模板缺失时请求选择可用模板并更新 project.wgcp', async () => {
    mockExistingPaths(
      '/games/vfs',
      '/games/vfs/game/config.txt',
      '/games/vfs/project.wgcp',
      '/games/vfs/game/background/cover.png',
    )
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: importedProjectEngineRef,
      template: {
        kind: 'engineBuiltin',
        engine: {
          id: 'default-publisher.default-engine',
          version: '4.4.0',
        },
      },
    })
    engineFindByRefMock.mockImplementation(async (ref: { version?: string }) => {
      if (ref.version === '4.6.2') {
        return createTestEngine({
          id: 'engine-1',
          name: 'WebGAL',
          version: '4.6.2',
        })
      }
      return
    })
    resolveTemplatePathMock.mockResolvedValue(undefined)
    const selectedTemplateBinding = {
      kind: 'standalone',
      name: 'Available Template',
    } as const
    mockTemplateLookupByName({
      'Available Template': createTestTemplate({
        metadata: {
          name: 'Available Template',
        },
      }),
    })
    const resolveDependencies = vi.fn().mockResolvedValue({
      template: { action: 'set', binding: selectedTemplateBinding },
    })

    await expect(gameManager.importGame(AbsPath.from('/games/vfs'), {
      resolveDependencies,
    })).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(resolveDependencies).toHaveBeenCalledOnce()
    expect(resolveDependencies).toHaveBeenCalledWith({
      ...configuredImportDependencyContext,
      resolvedEngineId: 'engine-1',
      template: {
        current: {
          kind: 'engineBuiltin',
          engine: {
            id: 'default-publisher.default-engine',
            version: '4.4.0',
          },
        },
        displayName: 'default-publisher.default-engine 4.4.0',
        reason: 'missing',
      },
    })
    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/vfs', {
      version: 1,
      engine: importedProjectEngineRef,
      template: selectedTemplateBinding,
    })
  })

  it('importGame 会在引用 engineBuiltin 模板无法解析时请求选择可用模板', async () => {
    mockExistingPaths(
      '/games/vfs',
      '/games/vfs/game/config.txt',
      '/games/vfs/project.wgcp',
      '/games/vfs/game/background/cover.png',
    )
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: importedProjectEngineRef,
      template: {
        kind: 'engineBuiltin',
        engine: {
          id: 'default-publisher.default-engine',
          version: '4.4.0',
        },
      },
    })
    engineFindByRefMock.mockImplementation(async (ref: { version?: string }) => {
      if (ref.version === '4.6.2') {
        return createTestEngine({
          id: 'engine-1',
          name: 'WebGAL',
          version: '4.6.2',
        })
      }
      if (ref.version === '4.4.0') {
        return createTestEngine({
          id: 'engine-old',
          name: 'WebGAL',
          version: '4.4.0',
        })
      }
      return
    })
    resolveTemplatePathMock.mockResolvedValue(undefined)
    const selectedTemplateBinding = {
      kind: 'standalone',
      name: 'Available Template',
    } as const
    mockTemplateLookupByName({
      'Available Template': createTestTemplate({
        metadata: {
          name: 'Available Template',
        },
      }),
    })
    const resolveDependencies = vi.fn().mockResolvedValue({
      template: { action: 'set', binding: selectedTemplateBinding },
    })

    await expect(gameManager.importGame(AbsPath.from('/games/vfs'), {
      resolveDependencies,
    })).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(resolveDependencies).toHaveBeenCalledOnce()
    expect(resolveDependencies).toHaveBeenCalledWith({
      ...configuredImportDependencyContext,
      resolvedEngineId: 'engine-1',
      template: {
        current: {
          kind: 'engineBuiltin',
          engine: {
            id: 'default-publisher.default-engine',
            version: '4.4.0',
          },
        },
        displayName: 'default-publisher.default-engine 4.4.0',
        reason: 'unavailable',
      },
    })
    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/vfs', {
      version: 1,
      engine: importedProjectEngineRef,
      template: selectedTemplateBinding,
    })
  })

  it('importGame 在引擎和模板同时不可用时只请求一次组合决策并一次性写回', async () => {
    mockExistingPaths(
      '/games/vfs',
      '/games/vfs/game/config.txt',
      '/games/vfs/project.wgcp',
      '/games/vfs/game/background/cover.png',
    )
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: importedProjectEngineRef,
      template: {
        kind: 'standalone',
        name: 'Modern Template',
      },
    })
    engineFindByRefMock.mockResolvedValue(undefined)
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-2',
      name: 'WebGAL',
      version: '4.6.2',
      status: 'created',
    }))
    mockTemplateLookupByName({
      'Available Template': createTestTemplate({
        metadata: {
          name: 'Available Template',
        },
      }),
    })
    resolveTemplatePathMock.mockResolvedValue(undefined)
    const selectedTemplateBinding = {
      kind: 'standalone',
      name: 'Available Template',
    } as const
    const resolveDependencies = vi.fn().mockResolvedValue({
      engineId: 'engine-2',
      template: { action: 'set', binding: selectedTemplateBinding },
    })

    await expect(gameManager.importGame(AbsPath.from('/games/vfs'), {
      resolveDependencies,
    })).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(resolveDependencies).toHaveBeenCalledOnce()
    expect(resolveDependencies).toHaveBeenCalledWith({
      ...configuredImportDependencyContext,
      engine: {
        current: importedProjectEngineRef,
        reason: 'missing',
      },
      template: {
        current: {
          kind: 'standalone',
          name: 'Modern Template',
        },
        displayName: 'Modern Template',
        reason: 'missing',
      },
    })
    expect(writeProjectConfigMock).toHaveBeenCalledOnce()
    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/vfs', {
      version: 1,
      engine: selectedProjectEngineRef,
      template: selectedTemplateBinding,
    })
    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      engineId: 'engine-2',
      pathLookupKey: '/games/vfs',
    }))
  })

  it('importGame 对匹配到 broken availability 引擎的配置项目会请求用户修复', async () => {
    mockExistingPaths(
      '/games/vfs',
      '/games/vfs/game/config.txt',
      '/games/vfs/project.wgcp',
      '/games/vfs/game/background/cover.png',
    )
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
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-2',
      name: 'WebGAL',
      version: '4.6.2',
      status: 'created',
    }))
    const resolveDependencies = vi.fn().mockResolvedValue({
      engineId: 'engine-2',
    })

    await expect(gameManager.importGame(AbsPath.from('/games/vfs'), {
      resolveDependencies,
    })).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(resolveDependencies).toHaveBeenCalledWith({
      ...configuredImportDependencyContext,
      engine: {
        current: {
          id: 'default-publisher.default-engine',
          version: '4.5.0',
        },
        reason: 'unavailable',
      },
    })
    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/vfs', {
      version: 1,
      engine: selectedProjectEngineRef,
    })
    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      engineId: 'engine-2',
      path: '/games/vfs',
      pathLookupKey: '/games/vfs',
    }))
  })

  it('importGame 对匹配到 error 引擎的配置项目会回退到重新选择可用引擎', async () => {
    mockExistingPaths(
      '/games/vfs',
      '/games/vfs/game/config.txt',
      '/games/vfs/project.wgcp',
      '/games/vfs/game/background/cover.png',
    )
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: importedProjectEngineRef,
    })
    engineFindByRefMock.mockResolvedValue(createTestEngine({
      id: 'engine-error',
      name: 'WebGAL',
      version: '4.6.2',
      status: 'error',
    }))
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-2',
      name: 'WebGAL',
      version: '4.6.2',
      status: 'created',
    }))

    const resolveDependencies = vi.fn().mockResolvedValue({
      engineId: 'engine-2',
    })

    await expect(gameManager.importGame(AbsPath.from('/games/vfs'), {
      resolveDependencies,
    })).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(resolveDependencies).toHaveBeenCalledWith({
      ...configuredImportDependencyContext,
      engine: {
        current: importedProjectEngineRef,
        reason: 'unavailable',
      },
    })
    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/vfs', {
      version: 1,
      engine: selectedProjectEngineRef,
    })
    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      engineId: 'engine-2',
      path: '/games/vfs',
      pathLookupKey: '/games/vfs',
    }))
  })

  it('importGame 在未匹配到引擎时会请求用户选择并更新 project.wgcp', async () => {
    mockExistingPaths(
      '/games/vfs',
      '/games/vfs/game/config.txt',
      '/games/vfs/project.wgcp',
      '/games/vfs/game/background/cover.png',
    )
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: importedProjectEngineRef,
    })
    engineFindByRefMock.mockResolvedValue(undefined)
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-2',
      name: 'WebGAL',
      version: '4.6.2',
      status: 'created',
    }))

    const resolveDependencies = vi.fn().mockResolvedValue({
      engineId: 'engine-2',
    })

    await expect(gameManager.importGame(AbsPath.from('/games/vfs'), {
      resolveDependencies,
    })).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(resolveDependencies).toHaveBeenCalledWith({
      ...configuredImportDependencyContext,
      engine: {
        current: importedProjectEngineRef,
        reason: 'missing',
      },
    })
    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/vfs', {
      version: 1,
      engine: selectedProjectEngineRef,
    })
    expect(dbGameAddMock).toHaveBeenCalledWith(expect.objectContaining({
      engineId: 'engine-2',
      pathLookupKey: '/games/vfs',
    }))
  })

  it('importGame 遇到已注册项目时会幂等返回既有 ID', async () => {
    dbGameWhereMock.mockReturnValue({
      equals: (pathLookupKey: string) => {
        expect(pathLookupKey).toBe('/games/demo')
        return {
          first: async () => createTestGame({
            id: 'game-existing',
            path: AbsPath.from('/games/demo'),
          }),
        }
      },
    })

    await expect(gameManager.importGame(AbsPath.from('/games/demo'))).resolves.toEqual({
      id: 'game-existing',
      alreadyRegistered: true,
    })
    expect(dbGameAddMock).not.toHaveBeenCalled()
  })

  it('importGame 对大小写不同但归一化相同的路径也会幂等返回既有 ID', async () => {
    dbGameWhereMock.mockReturnValue({
      equals: () => ({
        first: async () => createTestGame({
          id: 'game-existing',
          path: AbsPath.from('/Games/Demo'),
        }),
      }),
    })

    await expect(gameManager.importGame(AbsPath.from('/games/demo'))).resolves.toEqual({
      id: 'game-existing',
      alreadyRegistered: true,
    })
    expect(dbGameAddMock).not.toHaveBeenCalled()
  })

  it('game 身份键与自动发现复用同一套路径规范化规则', () => {
    expect(gameManager.identityKeyOf({ path: AbsPath.from('/Games/Demo/') })).toBe('/games/demo')
  })

  it('importGame 在 legacy 项目需要选择引擎时复用组合依赖解析流程', async () => {
    mockExistingPaths(
      '/games/no-engine',
      '/games/no-engine/game/config.txt',
      '/games/no-engine/game/background/cover.png',
    )
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-2',
      name: 'WebGAL',
      version: '4.6.2',
      status: 'created',
    }))
    const resolveDependencies = vi.fn().mockResolvedValue({
      engineId: 'engine-2',
    })

    await expect(gameManager.importGame(AbsPath.from('/games/no-engine'), {
      resolveDependencies,
    })).resolves.toEqual({ id: 'game-1', alreadyRegistered: false })

    expect(resolveDependencies).toHaveBeenCalledOnce()
    expect(resolveDependencies).toHaveBeenCalledWith(legacyImportDependencyContext)
    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/no-engine', {
      version: 1,
      engine: selectedProjectEngineRef,
    })
  })

  it('importGame 会拒绝依赖选择返回的不可用引擎', async () => {
    mockExistingPaths(
      '/games/no-engine',
      '/games/no-engine/game/config.txt',
      '/games/no-engine/game/background/cover.png',
    )
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      availability: 'broken',
      id: 'engine-broken',
      metadata: { webgalVersion: '4.6.2' },
      name: 'WebGAL',
      version: '4.6.2',
    }))

    await expect(gameManager.importGame(AbsPath.from('/games/no-engine'), {
      resolveDependencies: vi.fn().mockResolvedValue({
        engineId: 'engine-broken',
      }),
    })).rejects.toMatchObject({
      code: 'ENGINE_EDITOR_INCOMPATIBLE',
      details: {
        issue: 'unavailable',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    })

    expect(writeProjectConfigMock).not.toHaveBeenCalled()
    expect(dbGameAddMock).not.toHaveBeenCalled()
  })

  it('importGame 在用户取消选择依赖时会返回取消原因', async () => {
    mockExistingPaths(
      '/games/no-engine',
      '/games/no-engine/game/config.txt',
      '/games/no-engine/game/background/cover.png',
    )

    await expect(gameManager.importGame(AbsPath.from('/games/no-engine'), {
      resolveDependencies: vi.fn().mockResolvedValue(undefined),
    })).rejects.toEqual(
      new AppError('IO_ERROR', '导入已取消', {
        details: { reason: 'IMPORT_CANCELLED' },
      }),
    )
  })

  it('importGame 对损坏且无法恢复的 project.wgcp 返回配置损坏原因', async () => {
    mockExistingPaths(
      '/games/broken-config',
      '/games/broken-config/game/config.txt',
      '/games/broken-config/project.wgcp',
      '/games/broken-config/game/background/cover.png',
    )
    readProjectConfigMock.mockRejectedValue(new AppError('INVALID_PROJECT_CONFIG', 'project.wgcp 损坏'))

    await expect(gameManager.importGame(AbsPath.from('/games/broken-config'))).rejects.toEqual(
      new AppError('INVALID_PROJECT_CONFIG', '项目配置文件损坏', {
        details: { reason: 'CONFIG_CORRUPTED' },
      }),
    )
  })

  it('importGame 不会因为 project.wgcp 损坏且存在 index.html 而降级成自带引擎项目', async () => {
    mockExistingPaths(
      '/games/broken-config',
      '/games/broken-config/game/config.txt',
      '/games/broken-config/project.wgcp',
      '/games/broken-config/index.html',
      '/games/broken-config/game/background/cover.png',
    )
    readProjectConfigMock.mockRejectedValue(new AppError('INVALID_PROJECT_CONFIG', 'project.wgcp 损坏'))

    await expect(gameManager.importGame(AbsPath.from('/games/broken-config'))).rejects.toEqual(
      new AppError('INVALID_PROJECT_CONFIG', '项目配置文件损坏', {
        details: { reason: 'CONFIG_CORRUPTED' },
      }),
    )

    expect(writeProjectConfigMock).not.toHaveBeenCalled()
    expect(dbGameAddMock).not.toHaveBeenCalled()
  })

  it('importGame 不会把非配置解析错误伪装成配置损坏', async () => {
    mockExistingPaths(
      '/games/io-error',
      '/games/io-error/game/config.txt',
      '/games/io-error/project.wgcp',
      '/games/io-error/game/background/cover.png',
    )
    readProjectConfigMock.mockRejectedValue(new AppError('IO_ERROR', '权限不足'))

    await expect(gameManager.importGame(AbsPath.from('/games/io-error'))).rejects.toEqual(
      new AppError('IO_ERROR', '权限不足'),
    )
  })

  it('resolvePreviewSite 会返回游戏路径与已解析的引擎路径', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      path: AbsPath.from('/engines/WebGAL/4.5.0'),
    }))

    await expect(gameManager.resolvePreviewSite({
      path: AbsPath.from('/games/demo'),
      engineId: 'engine-1',
    })).resolves.toEqual({
      projectPath: '/games/demo',
      enginePath: '/engines/WebGAL/4.5.0',
    })
  })

  it('getGameEnginePath 会忽略 broken availability 引擎，允许回退为仅编辑本地 game 目录', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      path: AbsPath.from('/engines/WebGAL/4.5.0'),
      availability: 'broken',
    }))

    await expect(gameManager.getGameEnginePath({
      path: AbsPath.from('/games/demo'),
      engineId: 'engine-1',
    })).resolves.toBeUndefined()
  })

  it('resolvePreviewSite 会在引擎绑定项目的引擎不可用时直接拒绝预览', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      path: AbsPath.from('/engines/WebGAL/4.5.0'),
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
      path: AbsPath.from('/games/demo'),
      engineId: 'engine-1',
    })).rejects.toMatchObject({
      code: 'ENGINE_EDITOR_INCOMPATIBLE',
      details: {
        issue: 'unavailable',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    })
  })

  it('resolvePreviewSite 会在已绑定引擎记录缺失时返回结构化缺失原因', async () => {
    dbEngineGetMock.mockResolvedValue(undefined)
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.6.2',
      },
    })

    await expect(gameManager.resolvePreviewSite({
      path: AbsPath.from('/games/demo'),
      engineId: 'engine-missing',
    })).rejects.toMatchObject({
      code: 'IO_ERROR',
      details: {
        reason: 'ENGINE_NOT_FOUND',
      },
    })
  })

  it('resolvePreviewSite 会拒绝协议不兼容的已绑定引擎', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      path: AbsPath.from('/engines/WebGAL/4.6.0'),
      metadata: { webgalVersion: '4.6.0' },
    }))
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.6.0',
      },
    })

    await expect(gameManager.resolvePreviewSite({
      path: AbsPath.from('/games/demo'),
      engineId: 'engine-1',
    })).rejects.toMatchObject({
      code: 'ENGINE_EDITOR_INCOMPATIBLE',
      details: {
        issue: 'versionTooOld',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    })
  })

  it('resolveStaticAssetSite 会在绑定引擎不兼容时回退为项目静态站点', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      path: AbsPath.from('/engines/WebGAL/4.6.0'),
      metadata: { webgalVersion: '4.6.0' },
    }))
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.6.0',
      },
    })

    await expect(gameManager.resolveStaticAssetSite({
      path: AbsPath.from('/games/demo'),
      engineId: 'engine-1',
    })).resolves.toEqual({
      projectPath: '/games/demo',
    })

    expect(resolveTemplatePathMock).not.toHaveBeenCalled()
  })

  it('resolveStaticAssetSite 会在绑定引擎兼容时保留 VFS 静态资源上下文', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      path: AbsPath.from('/engines/WebGAL/4.6.2'),
      metadata: { webgalVersion: '4.6.2' },
    }))
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.6.2',
      },
    })
    resolveTemplatePathMock.mockResolvedValue(AbsPath.from('/engines/WebGAL/4.6.2/game/template'))

    await expect(gameManager.resolveStaticAssetSite({
      path: AbsPath.from('/games/demo'),
      engineId: 'engine-1',
    })).resolves.toEqual({
      projectPath: '/games/demo',
      enginePath: '/engines/WebGAL/4.6.2',
      templatePath: '/engines/WebGAL/4.6.2/game/template',
    })
  })

  it('ensureEditorRuntimeCompatible 会拒绝不兼容引擎且不改写游戏可用性', async () => {
    dbEngineGetMock.mockResolvedValue(createTestEngine({
      id: 'engine-1',
      metadata: { webgalVersion: '4.6.0' },
      path: AbsPath.from('/engines/WebGAL/4.6.0'),
    }))
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.6.0',
      },
    })

    const game = createTestGame({
      availability: 'available',
      engineId: 'engine-1',
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
    })

    await expect(gameManager.ensureEditorRuntimeCompatible(game)).rejects.toMatchObject({
      code: 'ENGINE_EDITOR_INCOMPATIBLE',
      details: {
        issue: 'versionTooOld',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    })

    expect(dbGameUpdateMock).not.toHaveBeenCalled()
  })

  it('ensureEditorRuntimeCompatible 会在已绑定引擎记录缺失时返回结构化缺失原因', async () => {
    dbEngineGetMock.mockResolvedValue(undefined)
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: {
        id: 'default-publisher.default-engine',
        version: '4.6.2',
      },
    })

    await expect(gameManager.ensureEditorRuntimeCompatible({
      path: AbsPath.from('/games/demo'),
      engineId: 'engine-missing',
    })).rejects.toMatchObject({
      code: 'IO_ERROR',
      details: {
        reason: 'ENGINE_NOT_FOUND',
      },
    })
  })

  it('importGame 遇到不存在的目录时抛出 DIR_NOT_FOUND', async () => {
    existsMock.mockResolvedValue(false)

    await expect(gameManager.importGame(AbsPath.from('/games/missing'))).rejects.toEqual(
      new AppError('DIR_NOT_FOUND', '游戏目录不存在'),
    )

    expect(warnMock).toHaveBeenCalledWith('[游戏导入] 游戏目录不存在: /games/missing')
  })

  it('importGame 遇到缺失 game/config.txt 的目录时抛出 INVALID_STRUCTURE', async () => {
    existsMock.mockImplementation(async (path: string) => path === '/games/invalid')

    await expect(gameManager.importGame(AbsPath.from('/games/invalid'))).rejects.toEqual(
      new AppError('INVALID_STRUCTURE', '无效的游戏文件夹'),
    )

    expect(warnMock).toHaveBeenCalledWith('[游戏导入] 无效的游戏文件夹: /games/invalid')
  })

  it('importGame 在 config.txt 解析失败时抛出 INVALID_CONFIG', async () => {
    existsMock.mockResolvedValue(true)
    gameCmdsGetGameConfigMock.mockRejectedValue(new Error('parse failed'))

    await expect(gameManager.importGame(AbsPath.from('/games/bad-config'))).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    })

    expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('[游戏导入] 游戏配置解析失败: /games/bad-config'))
  })

  it('inspectGame 在路径不存在时返回 missing + DIR_NOT_FOUND', async () => {
    existsMock.mockResolvedValue(false)

    await expect(gameManager.inspectGame(AbsPath.from('/games/missing'))).resolves.toMatchObject({
      availability: 'missing',
      warnings: [],
      blockingIssue: { code: 'DIR_NOT_FOUND' },
    })
  })

  it('inspectGame 在缺失 game/config.txt 时返回 broken + INVALID_STRUCTURE', async () => {
    existsMock.mockImplementation(async (path: string) => path === '/games/demo')

    await expect(gameManager.inspectGame(AbsPath.from('/games/demo'))).resolves.toMatchObject({
      availability: 'broken',
      blockingIssue: { code: 'INVALID_STRUCTURE' },
    })
  })

  it('inspectGame 在 gameName 为空时仅产 missing-game-name warning', async () => {
    existsMock.mockResolvedValue(true)
    gameCmdsGetGameConfigMock.mockResolvedValue(createGameConfig([
      { key: 'Game_name', value: '' },
      { key: 'Title_img', value: 'cover.png' },
    ]))

    await expect(gameManager.inspectGame(AbsPath.from('/games/demo'))).resolves.toMatchObject({
      availability: 'available',
      warnings: [{ code: 'missing-game-name' }],
    })
  })

  it('inspectGame 在 favicon 缺失时只产 warning', async () => {
    mockExistingPaths(
      '/games/demo',
      '/games/demo/game/config.txt',
      '/games/demo/game/background/cover.png',
    )

    await expect(gameManager.inspectGame(AbsPath.from('/games/demo'))).resolves.toMatchObject({
      availability: 'available',
      warnings: [{ code: 'missing-game-icon' }],
    })
  })

  it('inspectGame 在 titleImg 为空时产 missing-title-image warning', async () => {
    existsMock.mockResolvedValue(true)
    gameCmdsGetGameConfigMock.mockResolvedValue(createGameConfig([
      { key: 'Game_name', value: 'Demo Game' },
      { key: 'Title_img', value: '' },
    ]))

    await expect(gameManager.inspectGame(AbsPath.from('/games/demo'))).resolves.toMatchObject({
      availability: 'available',
      warnings: [{ code: 'missing-title-image' }],
    })
  })

  it('inspectGame 在 titleImg 文件不存在时产 missing-title-image-file warning', async () => {
    existsMock.mockImplementation(async (path: string) => path !== '/games/demo/game/background/cover.png')

    await expect(gameManager.inspectGame(AbsPath.from('/games/demo'))).resolves.toMatchObject({
      availability: 'available',
      warnings: [{ code: 'missing-title-image-file' }],
    })
  })

  it('refreshRegisteredGameSnapshot 会按路径刷新数据库快照，并只刷新变化资源的缓存版本', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
    dbGameWhereFirstMock.mockResolvedValue(createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
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
      path: AbsPath.from('/games/demo'),
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

    await gameManager.refreshRegisteredGameSnapshot(AbsPath.from('/games/demo'))

    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', {
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
      metadata: {
        name: 'Renamed Game',
        titleImg: 'cover-next.png',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: 111,
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
          cacheVersion: 111,
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

  it('refreshRegisteredGameSnapshot 在语义元数据变化但预览路径不变时保留资源缓存版本', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
    dbGameWhereFirstMock.mockResolvedValue(createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
      metadata: {
        name: 'Old Name',
        titleImg: 'cover.png',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/cover.png',
          cacheVersion: 222,
        },
      },
    }))
    gameCmdsGetGameConfigMock.mockResolvedValue(createGameConfig([
      { key: 'Game_name', value: 'Renamed Game' },
      { key: 'Title_img', value: 'cover.png' },
    ]))

    await gameManager.refreshRegisteredGameSnapshot(AbsPath.from('/games/demo'))

    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', {
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
      metadata: {
        name: 'Renamed Game',
        titleImg: 'cover.png',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/cover.png',
          cacheVersion: 222,
        },
      },
    })

    vi.useRealTimers()
  })

  it('refreshRegisteredGameSnapshot 写入前会基于最新游戏记录合并预览缓存版本', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
      const staleGame = createTestGame({
        id: 'game-1',
        path: AbsPath.from('/games/demo'),
        previewAssets: {
          icon: {
            path: 'icons/favicon.ico',
            cacheVersion: 111,
          },
          cover: {
            path: 'game/background/cover.png',
            cacheVersion: 222,
          },
        },
      })
      const latestGame = createTestGame({
        id: 'game-1',
        path: AbsPath.from('/games/demo'),
        previewAssets: {
          icon: {
            path: 'icons/favicon.ico',
            cacheVersion: 333,
          },
          cover: {
            path: 'game/background/cover.png',
            cacheVersion: 444,
          },
        },
      })
      dbGameWhereFirstMock
        .mockResolvedValueOnce(staleGame)
        .mockResolvedValueOnce(latestGame)
      gameCmdsGetGameConfigMock.mockResolvedValue(createGameConfig([
        { key: 'Game_name', value: 'Renamed Game' },
        { key: 'Title_img', value: 'cover.png' },
      ]))

      await gameManager.refreshRegisteredGameSnapshot(AbsPath.from('/games/demo'))

      expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', expect.objectContaining({
        previewAssets: {
          icon: {
            path: 'icons/favicon.ico',
            cacheVersion: 333,
          },
          cover: {
            path: 'game/background/cover.png',
            cacheVersion: 444,
          },
        },
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('refreshRegisteredGameSnapshot 支持显式只刷新图标缓存版本', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
    dbGameWhereFirstMock.mockResolvedValue(createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/cover.png',
          cacheVersion: 222,
        },
      },
    }))

    await gameManager.refreshRegisteredGameSnapshot(AbsPath.from('/games/demo'), { invalidate: 'icon' })

    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', expect.objectContaining({
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
        cover: {
          path: 'game/background/cover.png',
          cacheVersion: 222,
        },
      },
    }))

    vi.useRealTimers()
  })

  it('deleteGame 选择 trash 时会将游戏目录移到回收站后再删除记录', async () => {
    await gameManager.deleteGame(createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
    }), 'trash')

    expect(deleteFileMock).toHaveBeenCalledWith('/games/demo', false)
    expect(dbGameDeleteMock).toHaveBeenCalledWith('game-1')
    expect(deleteFileMock.mock.invocationCallOrder[0]).toBeLessThan(
      dbGameDeleteMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
  })

  it('deleteGame 选择 permanent 时会显式永久删除游戏目录', async () => {
    await gameManager.deleteGame(createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
    }), 'permanent')

    expect(deleteFileMock).toHaveBeenCalledWith('/games/demo', true)
    expect(dbGameDeleteMock).toHaveBeenCalledWith('game-1')
  })

  it('deleteGame 永久删除时数据库删除失败不会触碰游戏目录', async () => {
    dbGameDeleteMock.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(gameManager.deleteGame(createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
    }), 'permanent')).rejects.toThrow('database unavailable')

    expect(deleteFileMock).not.toHaveBeenCalled()
  })

  it('deleteGame 永久删除目录失败时会恢复游戏记录', async () => {
    const game = createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
    })
    deleteFileMock.mockRejectedValueOnce(new Error('permission denied'))

    await expect(gameManager.deleteGame(game, 'permanent')).rejects.toThrow('permission denied')

    expect(dbGameAddMock).toHaveBeenCalledWith(game)
  })

  it('deleteGame 在移动游戏目录失败时会保留游戏记录', async () => {
    deleteFileMock.mockRejectedValueOnce(new Error('trash unavailable'))

    await expect(gameManager.deleteGame(createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
    }), 'trash')).rejects.toThrow('trash unavailable')

    expect(dbGameDeleteMock).not.toHaveBeenCalled()
  })

  it('touchGameLastModified 只更新时间戳，不刷新预览资源快照', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
    const game = createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
      metadata: {
        name: 'Demo',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/current-cover.png',
          cacheVersion: 222,
        },
      },
    })
    dbGameGetMock.mockResolvedValue(game)
    workspaceStoreState.currentGame = game

    await gameManager.touchGameLastModified('game-1')

    expect(gameCmdsGetGameConfigMock).not.toHaveBeenCalled()
    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', {
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
    })
    expect(workspaceStoreState.currentGame).toEqual({
      id: 'game-1',
      path: '/games/demo',
      pathLookupKey: '/games/demo',
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
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/current-cover.png',
          cacheVersion: 222,
        },
      },
    })

    vi.useRealTimers()
  })

  it('refreshGamePreviewAssets 会刷新预览资源快照，并只刷新变化资源的缓存版本', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
    workspaceStoreState.currentGame = createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
      metadata: {
        name: 'Demo',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
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
      path: AbsPath.from('/games/demo'),
      metadata: {
        name: 'Demo',
      },
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
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

    await gameManager.refreshGamePreviewAssets('game-1')

    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', {
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: 111,
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
      pathLookupKey: '/games/demo',
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
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/cover-next.png',
          cacheVersion: new Date('2026-03-28T10:00:00.000Z').getTime(),
        },
      },
    })

    vi.useRealTimers()
  })

  it('refreshGamePreviewAssets 写入前会基于最新游戏记录合并预览缓存版本', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
      const staleGame = createTestGame({
        id: 'game-1',
        path: AbsPath.from('/games/demo'),
        previewAssets: {
          icon: {
            path: 'icons/favicon.ico',
            cacheVersion: 111,
          },
          cover: {
            path: 'game/background/cover.png',
            cacheVersion: 222,
          },
        },
      })
      const latestGame = createTestGame({
        id: 'game-1',
        path: AbsPath.from('/games/demo'),
        previewAssets: {
          icon: {
            path: 'icons/favicon.ico',
            cacheVersion: 333,
          },
          cover: {
            path: 'game/background/cover.png',
            cacheVersion: 444,
          },
        },
      })
      dbGameGetMock
        .mockResolvedValueOnce(staleGame)
        .mockResolvedValueOnce(latestGame)
      gameCmdsGetGameConfigMock.mockResolvedValue(createGameConfig([
        { key: 'Game_name', value: 'Renamed Game' },
        { key: 'Title_img', value: 'cover.png' },
      ]))

      await gameManager.refreshGamePreviewAssets('game-1')

      expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', expect.objectContaining({
        previewAssets: {
          icon: {
            path: 'icons/favicon.ico',
            cacheVersion: 333,
          },
          cover: {
            path: 'game/background/cover.png',
            cacheVersion: 444,
          },
        },
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('refreshGamePreviewAssets 等待资源解析完成后再生成修改时间，避免覆盖更新的 touch', async () => {
    vi.useFakeTimers()
    const refreshStartTime = new Date('2026-03-28T10:00:00.000Z').getTime()
    const touchTime = refreshStartTime + 10
    const refreshCommitTime = refreshStartTime + 20
    vi.setSystemTime(refreshStartTime)
    const configDeferred = createDeferred<ReturnType<typeof createGameConfig>>()

    let storedGame = createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
      lastModified: 0,
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/current-cover.png',
          cacheVersion: 222,
        },
      },
    })
    dbGameGetMock.mockImplementation(async () => storedGame)
    dbGameUpdateMock.mockImplementation(async (_gameId: string, patch: Partial<typeof storedGame>) => {
      storedGame = {
        ...storedGame,
        ...patch,
        metadata: { ...storedGame.metadata, ...patch.metadata },
        previewAssets: { ...storedGame.previewAssets, ...patch.previewAssets },
      }
      return 1
    })
    workspaceStoreState.currentGame = createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
      lastModified: 0,
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/current-cover.png',
          cacheVersion: 222,
        },
      },
    })
    gameCmdsGetGameConfigMock.mockReturnValue(configDeferred.promise)

    const refreshPromise = gameManager.refreshGamePreviewAssets('game-1')
    await vi.waitFor(() => {
      expect(gameCmdsGetGameConfigMock).toHaveBeenCalled()
    })

    vi.setSystemTime(touchTime)
    await gameManager.touchGameLastModified('game-1')

    vi.setSystemTime(refreshCommitTime)
    configDeferred.resolve(createGameConfig([
      { key: 'Game_name', value: 'Changed Name' },
      { key: 'Title_img', value: 'cover-next.png' },
    ]))
    await refreshPromise

    expect(dbGameUpdateMock).toHaveBeenNthCalledWith(1, 'game-1', {
      lastModified: touchTime,
    })
    expect(dbGameUpdateMock).toHaveBeenNthCalledWith(2, 'game-1', {
      lastModified: refreshCommitTime,
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/cover-next.png',
          cacheVersion: refreshCommitTime,
        },
      },
    })
    expect(workspaceStoreState.currentGame?.lastModified).toBe(refreshCommitTime)

    vi.useRealTimers()
  })

  it('refreshGamePreviewAssets 在游戏记录不存在时不会继续更新数据库或当前工作区状态', async () => {
    dbGameGetMock.mockResolvedValue(undefined)

    await gameManager.refreshGamePreviewAssets('game-1')

    expect(dbGameUpdateMock).not.toHaveBeenCalled()
    expect(workspaceStoreState.currentGame).toBeUndefined()
  })

  it('refreshGamePreviewAssets 在预览资源解析失败时只推进修改时间', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T10:00:00.000Z'))
    dbGameGetMock.mockResolvedValue(createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
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
      path: AbsPath.from('/games/demo'),
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

    await gameManager.refreshGamePreviewAssets('game-1')

    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', {
      lastModified: new Date('2026-03-28T10:00:00.000Z').getTime(),
    })
    expect(warnMock).toHaveBeenCalledWith('刷新游戏预览资源快照失败: Error: config missing')

    vi.useRealTimers()
  })

  it('touchCurrentGameLastModified 会按 500ms 防抖更新当前游戏', async () => {
    vi.useFakeTimers()
    workspaceStoreState.currentGame = createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
    })
    dbGameGetMock.mockResolvedValue(createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
    }))

    gameManager.touchCurrentGameLastModified()
    gameManager.touchCurrentGameLastModified()

    expect(dbGameUpdateMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)

    expect(dbGameUpdateMock).toHaveBeenCalledTimes(1)
    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', expect.objectContaining({
      lastModified: expect.any(Number),
    }))

    vi.useRealTimers()
  })

  it('refreshCurrentGamePreviewAssets 会合并防抖窗口内的资源失效范围', async () => {
    vi.useFakeTimers()
    const refreshRequestTime = new Date('2026-03-28T10:00:00.000Z').getTime()
    const refreshCommitTime = refreshRequestTime + 500
    vi.setSystemTime(refreshRequestTime)
    workspaceStoreState.currentGame = createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/cover.png',
          cacheVersion: 222,
        },
      },
    })
    dbGameGetMock.mockResolvedValue(createTestGame({
      id: 'game-1',
      path: AbsPath.from('/games/demo'),
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: 111,
        },
        cover: {
          path: 'game/background/cover.png',
          cacheVersion: 222,
        },
      },
    }))

    gameManager.refreshCurrentGamePreviewAssets({ invalidate: 'icon' })
    gameManager.refreshCurrentGamePreviewAssets({ invalidate: 'cover' })

    await vi.advanceTimersByTimeAsync(500)

    expect(dbGameUpdateMock).toHaveBeenCalledTimes(1)
    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', expect.objectContaining({
      previewAssets: {
        icon: {
          path: 'icons/favicon.ico',
          cacheVersion: refreshCommitTime,
        },
        cover: {
          path: 'game/background/cover.png',
          cacheVersion: refreshCommitTime,
        },
      },
    }))

    vi.useRealTimers()
  })

  it('refreshCurrentGamePreviewAssets 会按游戏隔离防抖状态和资源失效范围', async () => {
    vi.useFakeTimers()
    try {
      const refreshRequestTime = new Date('2026-03-28T10:00:00.000Z').getTime()
      const refreshCommitTime = refreshRequestTime + 500
      vi.setSystemTime(refreshRequestTime)

      const gameOne = createTestGame({
        id: 'game-1',
        path: AbsPath.from('/games/one'),
        previewAssets: {
          icon: {
            path: 'icons/favicon.ico',
            cacheVersion: 111,
          },
          cover: {
            path: 'game/background/cover.png',
            cacheVersion: 222,
          },
        },
      })
      const gameTwo = createTestGame({
        id: 'game-2',
        path: AbsPath.from('/games/two'),
        previewAssets: {
          icon: {
            path: 'icons/favicon.ico',
            cacheVersion: 333,
          },
          cover: {
            path: 'game/background/cover.png',
            cacheVersion: 444,
          },
        },
      })
      dbGameGetMock.mockImplementation(async (gameId: string) => {
        if (gameId === 'game-1') {
          return gameOne
        }

        if (gameId === 'game-2') {
          return gameTwo
        }
      })

      workspaceStoreState.currentGame = gameOne
      gameManager.refreshCurrentGamePreviewAssets({ invalidate: 'icon' })
      workspaceStoreState.currentGame = gameTwo
      gameManager.refreshCurrentGamePreviewAssets({ invalidate: 'cover' })

      await vi.advanceTimersByTimeAsync(500)

      expect(dbGameUpdateMock).toHaveBeenCalledTimes(2)
      expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', expect.objectContaining({
        previewAssets: {
          icon: {
            path: 'icons/favicon.ico',
            cacheVersion: refreshCommitTime,
          },
          cover: {
            path: 'game/background/cover.png',
            cacheVersion: 222,
          },
        },
      }))
      expect(dbGameUpdateMock).toHaveBeenCalledWith('game-2', expect.objectContaining({
        previewAssets: {
          icon: {
            path: 'icons/favicon.ico',
            cacheVersion: 333,
          },
          cover: {
            path: 'game/background/cover.png',
            cacheVersion: refreshCommitTime,
          },
        },
      }))
    } finally {
      vi.useRealTimers()
    }
  })
})
