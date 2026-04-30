import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine, createTestGame } from '~/__tests__/factories'
import { engineManager } from '~/services/engine-manager'
import { AppError } from '~/types/errors'

const {
  addMock,
  basenameMock,
  copyDirectoryWithProgressMock,
  deleteFileMock,
  enginesDeleteMock,
  engineWhereFilterFirstMock,
  engineWhereFilterMock,
  engineWhereToArrayMock,
  enginesToArrayMock,
  enginesUpdateMock,
  engineWhereEqualsMock,
  engineWhereFirstMock,
  engineWhereMock,
  existsMock,
  findGamesToArrayMock,
  gameWhereEqualsMock,
  gameWhereMock,
  iconPathMock,
  joinMock,
  readEngineManifestMock,
  resourceStoreMock,
  useResourceStoreMock,
  useStorageSettingsStoreMock,
  validateDirectoryStructureMock,
} = vi.hoisted(() => ({
  addMock: vi.fn(),
  basenameMock: vi.fn(async (path: string) => path.split('/').at(-1) ?? path),
  copyDirectoryWithProgressMock: vi.fn(),
  deleteFileMock: vi.fn(),
  enginesDeleteMock: vi.fn(),
  engineWhereFilterFirstMock: vi.fn(),
  engineWhereFilterMock: vi.fn(),
  engineWhereToArrayMock: vi.fn(),
  enginesToArrayMock: vi.fn(),
  enginesUpdateMock: vi.fn(),
  engineWhereEqualsMock: vi.fn(),
  engineWhereFirstMock: vi.fn(),
  engineWhereMock: vi.fn(),
  existsMock: vi.fn(),
  findGamesToArrayMock: vi.fn(),
  gameWhereEqualsMock: vi.fn(),
  gameWhereMock: vi.fn(),
  iconPathMock: vi.fn(),
  joinMock: vi.fn(async (...parts: string[]) => parts.join('/').replaceAll('//', '/')),
  readEngineManifestMock: vi.fn(),
  resourceStoreMock: {
    finishProgress: vi.fn(),
    updateProgress: vi.fn(),
  },
  useResourceStoreMock: vi.fn(),
  useStorageSettingsStoreMock: vi.fn(),
  validateDirectoryStructureMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  basename: basenameMock,
  join: joinMock,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  attachConsole: vi.fn(),
}))

vi.mock('~/commands/engine', () => ({
  engineCmds: {
    readEngineManifest: readEngineManifestMock,
  },
}))

vi.mock('~/commands/fs', () => ({
  fsCmds: {
    copyDirectoryWithProgress: copyDirectoryWithProgressMock,
    deleteFile: deleteFileMock,
    validateDirectoryStructure: validateDirectoryStructureMock,
  },
}))

vi.mock('~/database/db', () => ({
  db: {
    engines: {
      add: addMock,
      delete: enginesDeleteMock,
      toArray: enginesToArrayMock,
      update: enginesUpdateMock,
      where: engineWhereMock,
    },
    games: {
      where: gameWhereMock,
    },
  },
}))

vi.mock('~/services/platform/app-paths', () => ({
  engineIconPath: iconPathMock,
}))

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

vi.mock('~/stores/storage-settings', () => ({
  useStorageSettingsStore: useStorageSettingsStoreMock,
}))

describe('engineManager', () => {
  beforeEach(() => {
    addMock.mockReset()
    basenameMock.mockClear()
    copyDirectoryWithProgressMock.mockReset()
    deleteFileMock.mockReset()
    enginesDeleteMock.mockReset()
    engineWhereFilterFirstMock.mockReset()
    engineWhereFilterMock.mockReset()
    engineWhereToArrayMock.mockReset()
    enginesToArrayMock.mockReset()
    enginesUpdateMock.mockReset()
    engineWhereEqualsMock.mockReset()
    engineWhereFirstMock.mockReset()
    engineWhereMock.mockReset()
    existsMock.mockReset()
    findGamesToArrayMock.mockReset()
    gameWhereEqualsMock.mockReset()
    gameWhereMock.mockReset()
    iconPathMock.mockReset()
    joinMock.mockClear()
    readEngineManifestMock.mockReset()
    resourceStoreMock.finishProgress.mockReset()
    resourceStoreMock.updateProgress.mockReset()
    useResourceStoreMock.mockReset()
    useStorageSettingsStoreMock.mockReset()
    validateDirectoryStructureMock.mockReset()

    iconPathMock.mockImplementation(async (enginePath: string) => `${enginePath}/icons/favicon.ico`)
    useResourceStoreMock.mockReturnValue(resourceStoreMock)
    useStorageSettingsStoreMock.mockReturnValue({ engineSavePath: '/engines' })
    engineWhereMock.mockReturnValue({
      equals: engineWhereEqualsMock,
    })
    engineWhereEqualsMock.mockReturnValue({
      first: engineWhereFirstMock,
      filter: engineWhereFilterMock,
      toArray: engineWhereToArrayMock,
    })
    engineWhereFilterMock.mockReturnValue({
      first: engineWhereFilterFirstMock,
    })
    gameWhereMock.mockReturnValue({
      equals: gameWhereEqualsMock,
    })
    gameWhereEqualsMock.mockReturnValue({
      toArray: findGamesToArrayMock,
    })
    engineWhereFirstMock.mockResolvedValue(undefined)
    engineWhereFilterFirstMock.mockResolvedValue(undefined)
    engineWhereToArrayMock.mockResolvedValue([])
    enginesToArrayMock.mockResolvedValue([])
    findGamesToArrayMock.mockResolvedValue([])
    existsMock.mockResolvedValue(false)
  })

  it('validateEngine 在目录结构有效时返回 true', async () => {
    validateDirectoryStructureMock.mockResolvedValue(true)

    await expect(engineManager.validateEngine('/engines/WebGAL')).resolves.toBe(true)

    expect(validateDirectoryStructureMock).toHaveBeenCalledWith(
      '/engines/WebGAL',
      ['game/template'],
      ['index.html', 'game/config.txt'],
    )
    expect(readEngineManifestMock).not.toHaveBeenCalled()
  })

  it('validateEngine 在目录结构无效时返回 false', async () => {
    validateDirectoryStructureMock.mockResolvedValue(false)

    await expect(engineManager.validateEngine('/engines/WebGAL')).resolves.toBe(false)

    expect(readEngineManifestMock).not.toHaveBeenCalled()
  })

  it('findEngineByRef 对新版引擎使用复合索引查询', async () => {
    const matchedEngine = createTestEngine({
      id: 'engine-4',
      name: 'WebGAL',
      version: '4.5.0',
    })
    engineWhereFirstMock.mockResolvedValue(matchedEngine)

    await expect(engineManager.findEngineByRef({
      id: 'open-webgal.webgal',
      version: '4.5.0',
    })).resolves.toEqual(matchedEngine)

    expect(engineWhereMock).toHaveBeenCalledWith('[engineId+version]')
    expect(engineWhereEqualsMock).toHaveBeenCalledWith(['open-webgal.webgal', '4.5.0'])
    expect(engineWhereFilterMock).not.toHaveBeenCalled()
  })

  it('findEngineByRef 在缺少版本时直接返回 undefined', async () => {
    await expect(engineManager.findEngineByRef({
      id: 'open-webgal.webgal-legacy',
    })).resolves.toBeUndefined()

    expect(engineWhereMock).not.toHaveBeenCalled()
    expect(engineWhereEqualsMock).not.toHaveBeenCalled()
    expect(engineWhereFilterMock).not.toHaveBeenCalled()
  })

  it('importEngine 会把新版引擎复制到 name/version 托管目录并回写状态', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.5.0',
        engineType: 'official',
        webgalVersion: '4.5.0',
        icon: 'branding/icon.png',
      },
    })
    validateDirectoryStructureMock.mockResolvedValue(true)
    addMock.mockResolvedValue('engine-1')
    copyDirectoryWithProgressMock.mockImplementation(async (_from, _to, onProgress: (value: number) => void) => {
      onProgress(25)
      onProgress(100)
    })

    await expect(engineManager.importEngine('/downloads/webgal')).resolves.toEqual({ id: 'engine-1', alreadyRegistered: false })

    expect(addMock).toHaveBeenCalledWith(expect.objectContaining({
      path: '/engines/WebGAL/4.5.0',
      name: 'WebGAL',
      version: '4.5.0',
      status: 'creating',
      metadata: expect.objectContaining({
        type: 'official',
      }),
    }))
    expect(copyDirectoryWithProgressMock).toHaveBeenCalledWith(
      '/downloads/webgal',
      '/engines/WebGAL/4.5.0',
      expect.any(Function),
    )
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(1, 'engine-1', 25)
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(2, 'engine-1', 100)
    expect(resourceStoreMock.finishProgress).toHaveBeenCalledWith('engine-1')
    expect(enginesUpdateMock).toHaveBeenCalledWith('engine-1', expect.objectContaining({
      status: 'created',
      name: 'WebGAL',
      version: '4.5.0',
      previewAssets: {
        icon: expect.objectContaining({
          path: '/engines/WebGAL/4.5.0/branding/icon.png',
        }),
      },
    }))
  })

  it('importEngine 会拒绝导入旧版引擎目录', async () => {
    readEngineManifestMock.mockResolvedValue({ status: 'missing' })
    validateDirectoryStructureMock.mockResolvedValue(true)

    await expect(engineManager.importEngine('/downloads/LegacyEngine')).rejects.toEqual(
      new AppError('INVALID_MANIFEST', '不支持导入旧版引擎，请导入包含该引擎的项目或使用受支持的引擎版本', {
        details: { reason: 'LEGACY_ENGINE' },
      }),
    )

    expect(addMock).not.toHaveBeenCalled()
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
  })

  it('importEngine 会拒绝 schemaVersion 不受支持的引擎', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'unsupportedSchema',
      schemaVersion: '2.0.0',
      supportedMajor: 1,
    })
    validateDirectoryStructureMock.mockResolvedValue(true)

    await expect(engineManager.importEngine('/downloads/futureEngine')).rejects.toMatchObject({
      code: 'INVALID_MANIFEST',
      details: {
        reason: 'UNSUPPORTED_SCHEMA',
        schemaVersion: '2.0.0',
        supportedMajor: 1,
      },
    })

    expect(addMock).not.toHaveBeenCalled()
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
  })

  it('importEngine 会拒绝 manifest 解析失败的引擎', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'invalid',
      reason: '缺少必填字段',
    })
    validateDirectoryStructureMock.mockResolvedValue(true)

    await expect(engineManager.importEngine('/downloads/brokenEngine')).rejects.toEqual(
      new AppError('INVALID_MANIFEST', '缺少必填字段', {
        details: {
          reason: 'PARSE_FAILED',
          manifestReason: '缺少必填字段',
        },
      }),
    )
  })

  it('importEngine 会拒绝同名同版本重复引擎', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.5.0',
        engineType: 'official',
        webgalVersion: '4.5.0',
      },
    })
    validateDirectoryStructureMock.mockResolvedValue(true)
    engineWhereFirstMock.mockResolvedValue(createTestEngine({
      name: 'WebGAL',
      version: '4.5.0',
    }))

    await expect(engineManager.importEngine('/downloads/webgal')).rejects.toEqual(
      new AppError('DUPLICATE_RESOURCE', '同名同版本的引擎已存在', {
        details: { reason: 'DUPLICATE_ENGINE' },
      }),
    )
  })

  it('importEngine 在源路径已注册时幂等返回既有 ID', async () => {
    enginesToArrayMock.mockResolvedValue([
      createTestEngine({
        id: 'engine-existing',
        path: '/downloads/webgal',
      }),
    ])

    await expect(engineManager.importEngine('/downloads/webgal')).resolves.toEqual({ id: 'engine-existing', alreadyRegistered: true })

    expect(addMock).not.toHaveBeenCalled()
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
  })

  it('importEngine 在目标目录已存在但无 DB 记录时抛出 TARGET_CONFLICT', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.5.0',
        engineType: 'official',
        webgalVersion: '4.5.0',
      },
    })
    validateDirectoryStructureMock.mockResolvedValue(true)
    existsMock.mockImplementation(async (path: string) => path === '/engines/WebGAL/4.5.0')

    await expect(engineManager.importEngine('/downloads/webgal')).rejects.toEqual(
      new AppError('TARGET_CONFLICT', '目标引擎目录已存在，请先清理后重试'),
    )
  })

  it('inspectEngine 在 favicon 缺失时只产 warning', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.5.0',
        engineType: 'official',
        webgalVersion: '4.5.0',
      },
    })
    validateDirectoryStructureMock.mockResolvedValue(true)
    existsMock.mockImplementation(async (path: string) => path !== '/source/icons/favicon.ico')

    await expect(engineManager.inspectEngine('/source')).resolves.toMatchObject({
      availability: 'available',
      warnings: [{ code: 'missing-favicon' }],
    })
  })

  it('validateAllEngines 会把失效目录标记为 missing availability', async () => {
    enginesToArrayMock.mockResolvedValue([
      createTestEngine({
        id: 'engine-1',
        path: '/engines/webgal',
        status: 'created',
      }),
    ])
    existsMock.mockResolvedValue(false)
    validateDirectoryStructureMock.mockResolvedValue(false)

    await engineManager.validateAllEngines()

    expect(enginesUpdateMock).toHaveBeenCalledWith('engine-1', { availability: 'missing' })
  })

  it('validateAllEngines 在 manifest 无效时标记为 broken availability', async () => {
    enginesToArrayMock.mockResolvedValue([
      createTestEngine({
        id: 'engine-1',
        path: '/engines/WebGAL/4.5.0',
        status: 'created',
      }),
    ])
    existsMock.mockResolvedValue(true)
    validateDirectoryStructureMock.mockResolvedValue(true)
    readEngineManifestMock.mockResolvedValue({ status: 'missing' })

    await engineManager.validateAllEngines()

    expect(enginesUpdateMock).toHaveBeenCalledWith('engine-1', { availability: 'broken' })
  })

  it('validateAllEngines 在目录结构有效时保持 available availability', async () => {
    enginesToArrayMock.mockResolvedValue([
      createTestEngine({
        id: 'engine-1',
        path: '/engines/WebGAL/4.5.0',
        status: 'created',
      }),
    ])
    existsMock.mockResolvedValue(true)
    validateDirectoryStructureMock.mockResolvedValue(true)
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.5.0',
        engineType: 'official',
        webgalVersion: '4.5.0',
      },
    })

    await engineManager.validateAllEngines()

    expect(enginesUpdateMock).not.toHaveBeenCalled()
  })

  it('validateAllEngines 在结构有效但 schemaVersion 不受支持时标记为 broken', async () => {
    enginesToArrayMock.mockResolvedValue([
      createTestEngine({
        id: 'engine-1',
        path: '/engines/WebGAL/4.5.0',
        status: 'created',
      }),
    ])
    existsMock.mockResolvedValue(true)
    validateDirectoryStructureMock.mockResolvedValue(true)
    readEngineManifestMock.mockResolvedValue({
      status: 'unsupportedSchema',
      schemaVersion: '2.0.0',
      supportedMajor: 1,
    })

    await engineManager.validateAllEngines()

    expect(enginesUpdateMock).toHaveBeenCalledWith('engine-1', { availability: 'broken' })
  })

  it('uninstallEngine 会阻止删除仍有关联游戏的引擎', async () => {
    findGamesToArrayMock.mockResolvedValue([
      createTestGame({
        metadata: { name: 'Demo Game' },
      }),
    ])

    await expect(engineManager.uninstallEngine(createTestEngine())).rejects.toEqual(
      new AppError('IO_ERROR', '无法删除引擎，以下游戏正在使用此引擎：Demo Game'),
    )
  })

  it('canDeleteEngine 会返回关联游戏列表', async () => {
    const associatedGame = createTestGame({
      id: 'game-1',
      metadata: { name: 'Demo Game' },
    })
    findGamesToArrayMock.mockResolvedValue([associatedGame])

    await expect(engineManager.canDeleteEngine('engine-1')).resolves.toEqual({
      canDelete: false,
      associatedGames: [associatedGame],
      reason: 'ENGINE_HAS_ASSOCIATED_GAMES',
    })
  })

  it('canDeleteEngine 在没有关联游戏时允许删除', async () => {
    findGamesToArrayMock.mockResolvedValue([])

    await expect(engineManager.canDeleteEngine('engine-1')).resolves.toEqual({
      canDelete: true,
    })
  })

  it('canDeleteEngineGroup 会汇总整组关联游戏', async () => {
    const stable = createTestEngine({
      id: 'engine-1',
      engineId: 'open-webgal.webgal',
      name: 'WebGAL',
      path: '/engines/WebGAL/4.5.0',
      version: '4.5.0',
    })
    const legacy = createTestEngine({
      id: 'engine-2',
      engineId: 'open-webgal.webgal',
      name: 'WebGAL',
      path: '/engines/WebGAL/4.4.0',
      version: '4.4.0',
    })
    const associatedGame = createTestGame({
      id: 'game-1',
      metadata: { name: 'Demo Game' },
    })

    engineWhereToArrayMock.mockResolvedValue([stable, legacy])
    findGamesToArrayMock
      .mockResolvedValueOnce([associatedGame])
      .mockResolvedValueOnce([])

    await expect(engineManager.canDeleteEngineGroup('open-webgal.webgal')).resolves.toEqual({
      canDelete: false,
      associatedGames: [associatedGame],
      reason: 'ENGINE_HAS_ASSOCIATED_GAMES',
    })

    expect(engineWhereMock).toHaveBeenCalledWith('engineId')
    expect(engineWhereEqualsMock).toHaveBeenCalledWith('open-webgal.webgal')
  })

  it('uninstallEngine 会删除托管目录和数据库记录', async () => {
    enginesDeleteMock.mockResolvedValue(undefined)

    await engineManager.uninstallEngine(createTestEngine())

    expect(deleteFileMock).toHaveBeenCalledWith('/engines/default', true)
    expect(enginesDeleteMock).toHaveBeenCalledWith('engine-1')
  })

  it('uninstallEngine 在删除托管目录失败时仍会移除数据库记录', async () => {
    enginesDeleteMock.mockResolvedValue(undefined)
    deleteFileMock.mockRejectedValueOnce(new Error('path missing'))

    await expect(engineManager.uninstallEngine(createTestEngine())).resolves.toBeUndefined()

    expect(deleteFileMock).toHaveBeenCalledWith('/engines/default', true)
    expect(enginesDeleteMock).toHaveBeenCalledWith('engine-1')
  })

  it('uninstallEngineGroup 会删除整组版本并清理记录', async () => {
    enginesDeleteMock.mockResolvedValue(undefined)
    engineWhereToArrayMock.mockResolvedValue([
      createTestEngine({
        id: 'engine-1',
        name: 'WebGAL',
        path: '/engines/WebGAL/4.5.0',
        version: '4.5.0',
      }),
      createTestEngine({
        id: 'engine-2',
        name: 'WebGAL',
        path: '/engines/WebGAL/4.4.0',
        version: '4.4.0',
      }),
    ])

    await engineManager.uninstallEngineGroup('open-webgal.webgal')

    expect(deleteFileMock).toHaveBeenNthCalledWith(1, '/engines/WebGAL/4.5.0', true)
    expect(deleteFileMock).toHaveBeenNthCalledWith(2, '/engines/WebGAL/4.4.0', true)
    expect(enginesDeleteMock).toHaveBeenNthCalledWith(1, 'engine-1')
    expect(enginesDeleteMock).toHaveBeenNthCalledWith(2, 'engine-2')
  })

  it('uninstallEngine 会在 broken availability 状态下仅移除数据库记录', async () => {
    enginesDeleteMock.mockResolvedValue(undefined)

    await engineManager.uninstallEngine(createTestEngine({
      availability: 'broken',
    }))

    expect(deleteFileMock).not.toHaveBeenCalled()
    expect(enginesDeleteMock).toHaveBeenCalledWith('engine-1')
  })
})
