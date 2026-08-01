import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine, createTestGame } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'
import { engineManager, evaluateEngineEditorCompatibility } from '~/services/engine-manager'
import { AppError } from '~/types/errors'

const {
  addMock,
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
  loggerWarnMock,
  readEngineManifestMock,
  resourceStoreMock,
  useResourceStoreMock,
  useStorageSettingsStoreMock,
  validateDirectoryStructureMock,
} = vi.hoisted(() => ({
  addMock: vi.fn(),
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
  loggerWarnMock: vi.fn(),
  readEngineManifestMock: vi.fn(),
  resourceStoreMock: {
    finishProgress: vi.fn(),
    updateProgress: vi.fn(),
  },
  useResourceStoreMock: vi.fn(),
  useStorageSettingsStoreMock: vi.fn(),
  validateDirectoryStructureMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: loggerWarnMock,
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
    loggerWarnMock.mockReset()
    readEngineManifestMock.mockReset()
    resourceStoreMock.finishProgress.mockReset()
    resourceStoreMock.updateProgress.mockReset()
    useResourceStoreMock.mockReset()
    useStorageSettingsStoreMock.mockReset()
    validateDirectoryStructureMock.mockReset()

    iconPathMock.mockImplementation((enginePath: string) => `${enginePath}/icons/favicon.ico`)
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

    await expect(engineManager.validateEngine(AbsPath.from('/engines/WebGAL'))).resolves.toBe(true)

    expect(validateDirectoryStructureMock).toHaveBeenCalledWith(
      '/engines/WebGAL',
      ['game/template'],
      ['index.html', 'game/config.txt'],
    )
    expect(readEngineManifestMock).not.toHaveBeenCalled()
  })

  it('validateEngine 在目录结构无效时返回 false', async () => {
    validateDirectoryStructureMock.mockResolvedValue(false)

    await expect(engineManager.validateEngine(AbsPath.from('/engines/WebGAL'))).resolves.toBe(false)

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

  it('evaluateEngineEditorCompatibility 会按严格三段版本判断编辑器运行时兼容性', () => {
    expect(evaluateEngineEditorCompatibility(createTestEngine({
      metadata: { webgalVersion: '4.6.2' },
    }))).toEqual({ compatible: true })
    expect(evaluateEngineEditorCompatibility(createTestEngine({
      metadata: { webgalVersion: '4.10.0' },
    }))).toEqual({ compatible: true })
    expect(evaluateEngineEditorCompatibility(createTestEngine({
      metadata: { webgalVersion: '4.6.1' },
    }))).toEqual({ compatible: false, issue: 'versionTooOld' })
    expect(evaluateEngineEditorCompatibility(createTestEngine({
      metadata: { webgalVersion: '4.6.2-beta' },
    }))).toEqual({ compatible: false, issue: 'versionTooOld' })
    expect(evaluateEngineEditorCompatibility(createTestEngine({
      metadata: { webgalVersion: undefined },
    }))).toEqual({ compatible: false, issue: 'versionInvalid' })
    expect(evaluateEngineEditorCompatibility(createTestEngine({
      metadata: { webgalVersion: '4.6' },
    }))).toEqual({ compatible: false, issue: 'versionInvalid' })
    expect(evaluateEngineEditorCompatibility(createTestEngine({
      metadata: { webgalVersion: 'invalid-build' },
    }))).toEqual({ compatible: false, issue: 'versionInvalid' })
    expect(evaluateEngineEditorCompatibility(createTestEngine({
      availability: 'broken',
      metadata: { webgalVersion: '4.10.0' },
    }))).toEqual({ compatible: false, issue: 'unavailable' })
  })

  it('importEngine 会把新版引擎复制到 name/version 托管目录并回写状态', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.6.2',
        engineType: 'official',
        webgalVersion: '4.6.2',
        icon: 'branding/icon.png',
      },
    })
    validateDirectoryStructureMock.mockResolvedValue(true)
    addMock.mockResolvedValue('engine-1')
    copyDirectoryWithProgressMock.mockImplementation(async (_from, _to, onProgress: (value: number) => void) => {
      onProgress(25)
      onProgress(100)
    })

    await expect(engineManager.importEngine(AbsPath.from('/downloads/webgal'))).resolves.toEqual({ id: 'engine-1', alreadyRegistered: false })

    expect(addMock).toHaveBeenCalledWith(expect.objectContaining({
      path: '/engines/WebGAL/4.6.2',
      pathLookupKey: '/engines/webgal/4.6.2',
      name: 'WebGAL',
      version: '4.6.2',
      status: 'creating',
      metadata: expect.objectContaining({
        type: 'official',
      }),
    }))
    expect(copyDirectoryWithProgressMock).toHaveBeenCalledWith(
      '/downloads/webgal',
      '/engines/WebGAL/4.6.2',
      expect.any(Function),
    )
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(1, 'engine-1', 0)
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(2, 'engine-1', 25)
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(3, 'engine-1', 100)
    expect(resourceStoreMock.finishProgress).toHaveBeenCalledWith('engine-1')
    expect(enginesUpdateMock).toHaveBeenCalledWith('engine-1', expect.objectContaining({
      status: 'created',
      name: 'WebGAL',
      version: '4.6.2',
      previewAssets: {
        icon: expect.objectContaining({
          path: '/engines/WebGAL/4.6.2/branding/icon.png',
        }),
      },
    }))
  })

  it('managed import 预检只读并在发布后直接注册最终目录', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.6.2',
        engineType: 'official',
        webgalVersion: '4.6.2',
      },
    })
    validateDirectoryStructureMock.mockResolvedValue(true)
    addMock.mockResolvedValue('engine-managed')

    const result = await engineManager.prepareManagedImport(AbsPath.from('/engines/.import-staging/session'))

    expect(result).toMatchObject({
      kind: 'ready',
      prepared: { finalRelativePath: 'WebGAL/4.6.2' },
    })
    expect(addMock).not.toHaveBeenCalled()
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()

    if (result.kind !== 'ready') {
      throw new Error('expected a ready managed import')
    }
    await expect(engineManager.registerManagedImport(
      AbsPath.from('/engines/WebGAL/4.6.2'),
      result.prepared,
    )).resolves.toEqual({ id: 'engine-managed' })

    expect(addMock).toHaveBeenCalledWith(expect.objectContaining({
      path: '/engines/WebGAL/4.6.2',
      previewAssets: {
        icon: expect.objectContaining({
          path: '/engines/WebGAL/4.6.2/icons/favicon.ico',
        }),
      },
      status: 'created',
    }))
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
  })

  it('managed import 在相同 engineId 和 version 已注册时于发布前返回 duplicate', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.6.2',
        engineType: 'official',
        webgalVersion: '4.6.2',
      },
    })
    validateDirectoryStructureMock.mockResolvedValue(true)
    engineWhereFirstMock.mockResolvedValue(createTestEngine({ id: 'engine-existing' }))

    await expect(engineManager.prepareManagedImport(
      AbsPath.from('/engines/.import-staging/session'),
    )).resolves.toEqual({ kind: 'duplicate', existingId: 'engine-existing' })

    expect(addMock).not.toHaveBeenCalled()
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
  })

  it('importEngine 会把 Windows 风格托管目录归一化为 POSIX 路径', async () => {
    useStorageSettingsStoreMock.mockReturnValue({ engineSavePath: 'C:\\Engines\\' })
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.6.2',
        engineType: 'official',
        webgalVersion: '4.6.2',
        icon: 'branding/icon.png',
      },
    })
    validateDirectoryStructureMock.mockResolvedValue(true)
    addMock.mockResolvedValue('engine-1')

    await expect(engineManager.importEngine(AbsPath.from(String.raw`C:\downloads\webgal`))).resolves.toEqual({
      id: 'engine-1',
      alreadyRegistered: false,
    })

    expect(addMock).toHaveBeenCalledWith(expect.objectContaining({
      path: 'C:/Engines/WebGAL/4.6.2',
      pathLookupKey: 'c:/engines/webgal/4.6.2',
    }))
    expect(copyDirectoryWithProgressMock).toHaveBeenCalledWith(
      'C:/downloads/webgal',
      'C:/Engines/WebGAL/4.6.2',
      expect.any(Function),
    )
  })

  it('importEngine 在缺少版本时会回退到基于 engineId 的稳定托管目录', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        engineType: 'official',
        webgalVersion: '4.6.2',
        icon: 'branding/icon.png',
      },
    })
    validateDirectoryStructureMock.mockResolvedValue(true)
    addMock.mockResolvedValue('engine-legacy')

    await expect(engineManager.importEngine(AbsPath.from('/downloads/webgal-legacy'))).resolves.toEqual({
      id: 'engine-legacy',
      alreadyRegistered: false,
    })

    expect(addMock).toHaveBeenCalledWith(expect.objectContaining({
      path: '/engines/WebGAL/open-webgal.webgal',
      pathLookupKey: '/engines/webgal/open-webgal.webgal',
      name: 'WebGAL',
      version: undefined,
      status: 'creating',
    }))
    expect(copyDirectoryWithProgressMock).toHaveBeenCalledWith(
      '/downloads/webgal-legacy',
      '/engines/WebGAL/open-webgal.webgal',
      expect.any(Function),
    )
  })

  it('importEngine 会拒绝导入旧版引擎目录', async () => {
    readEngineManifestMock.mockResolvedValue({ status: 'missing' })
    validateDirectoryStructureMock.mockResolvedValue(true)

    await expect(engineManager.importEngine(AbsPath.from('/downloads/unsupportedEngine'))).rejects.toEqual(
      new AppError('INVALID_MANIFEST', '不支持导入旧版引擎，请导入包含该引擎的项目或使用受支持的引擎版本', {
        details: { reason: 'LEGACY_ENGINE' },
      }),
    )

    expect(addMock).not.toHaveBeenCalled()
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
    expect(loggerWarnMock).toHaveBeenCalledWith('[引擎导入] 引擎清单无效: 路径=/downloads/unsupportedEngine, 原因=缺少 webgal-engine.json')
  })

  it('importEngine 会拒绝不满足编辑器运行时版本门禁的引擎', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.6.0',
        engineType: 'official',
        webgalVersion: '4.6.0',
      },
    })
    validateDirectoryStructureMock.mockResolvedValue(true)

    await expect(engineManager.importEngine(AbsPath.from('/downloads/webgal'))).rejects.toMatchObject({
      code: 'ENGINE_EDITOR_INCOMPATIBLE',
      details: {
        issue: 'versionTooOld',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    })

    expect(addMock).not.toHaveBeenCalled()
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
  })

  it('importEngine 会拒绝 webgalVersion 缺失或格式异常的引擎', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.6.2',
        engineType: 'official',
        webgalVersion: '4.6',
      },
    })
    validateDirectoryStructureMock.mockResolvedValue(true)

    await expect(engineManager.importEngine(AbsPath.from('/downloads/webgal'))).rejects.toMatchObject({
      code: 'ENGINE_EDITOR_INCOMPATIBLE',
      details: {
        issue: 'versionInvalid',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    })

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

    await expect(engineManager.importEngine(AbsPath.from('/downloads/futureEngine'))).rejects.toMatchObject({
      code: 'INVALID_MANIFEST',
      details: {
        reason: 'UNSUPPORTED_SCHEMA',
        schemaVersion: '2.0.0',
        supportedMajor: 1,
      },
    })

    expect(addMock).not.toHaveBeenCalled()
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
    expect(loggerWarnMock).toHaveBeenCalledWith(
      '[引擎导入] 引擎清单无效: 路径=/downloads/futureEngine, 原因=schemaVersion 2.0.0 不受支持，最高支持主版本 1',
    )
  })

  it('importEngine 会拒绝 manifest 解析失败的引擎', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'invalid',
      reason: '缺少必填字段',
    })
    validateDirectoryStructureMock.mockResolvedValue(true)

    await expect(engineManager.importEngine(AbsPath.from('/downloads/brokenEngine'))).rejects.toEqual(
      new AppError('INVALID_MANIFEST', '缺少必填字段', {
        details: {
          reason: 'PARSE_FAILED',
          manifestReason: '缺少必填字段',
        },
      }),
    )

    expect(loggerWarnMock).toHaveBeenCalledWith('[引擎导入] 引擎清单无效: 路径=/downloads/brokenEngine, 原因=缺少必填字段')
  })

  it('importEngine 在同 engineId+version 已注册时幂等返回既有 ID', async () => {
    const existingEngine = createTestEngine({
      id: 'engine-existing-by-ref',
      name: 'WebGAL',
      version: '4.6.2',
    })
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.6.2',
        engineType: 'official',
        webgalVersion: '4.6.2',
      },
    })
    validateDirectoryStructureMock.mockResolvedValue(true)
    engineWhereMock.mockImplementation((index: string) => ({
      equals: (value: unknown) => ({
        first: async () => {
          if (index !== '[engineId+version]' || !Array.isArray(value)) {
            return
          }

          const [engineId, version] = value
          return engineId === 'open-webgal.webgal' && version === '4.6.2'
            ? existingEngine
            : undefined
        },
      }),
    }))

    await expect(engineManager.importEngine(AbsPath.from('/downloads/webgal'))).resolves.toEqual({
      id: 'engine-existing-by-ref',
      alreadyRegistered: true,
    })

    expect(engineWhereMock).toHaveBeenNthCalledWith(1, 'pathLookupKey')
    expect(engineWhereMock).toHaveBeenNthCalledWith(2, '[engineId+version]')
    expect(addMock).not.toHaveBeenCalled()
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
  })

  it('importEngine 在源路径已注册时幂等返回既有 ID', async () => {
    engineWhereFirstMock.mockResolvedValue(createTestEngine({
      id: 'engine-existing',
      path: AbsPath.from('/downloads/webgal'),
    }))

    await expect(engineManager.importEngine(AbsPath.from('/downloads/webgal'))).resolves.toEqual({ id: 'engine-existing', alreadyRegistered: true })

    expect(addMock).not.toHaveBeenCalled()
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
  })

  it('engine 身份键优先使用 engineId + version', () => {
    expect(engineManager.identityKeyOf({
      path: AbsPath.from('/downloads/webgal'),
      engineId: 'open-webgal.webgal',
      version: '4.5.0',
    })).toBe('open-webgal.webgal:4.5.0')
  })

  it('engine 身份键在缺少版本时回退到路径规范化结果', () => {
    expect(engineManager.identityKeyOf({
      path: AbsPath.from('/Downloads/WebGAL/'),
      engineId: 'open-webgal.webgal',
    })).toBe('/downloads/webgal')
  })

  it('importEngine 在目标目录已存在但无 DB 记录时抛出 TARGET_CONFLICT', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.6.2',
        engineType: 'official',
        webgalVersion: '4.6.2',
      },
    })
    validateDirectoryStructureMock.mockResolvedValue(true)
    existsMock.mockImplementation(async (path: string) => path === '/engines/WebGAL/4.6.2')

    await expect(engineManager.importEngine(AbsPath.from('/downloads/webgal'))).rejects.toEqual(
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

    await expect(engineManager.inspectEngine(AbsPath.from('/source'))).resolves.toMatchObject({
      availability: 'available',
      warnings: [{ code: 'missing-favicon' }],
    })
  })

  it('inspectEngine 检查 manifest 中自定义 icon 路径', async () => {
    readEngineManifestMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.5.0',
        engineType: 'official',
        webgalVersion: '4.5.0',
        icon: 'assets/custom.png',
      },
    })
    validateDirectoryStructureMock.mockResolvedValue(true)
    // 默认 favicon 路径存在但自定义 icon 不存在，应仍然产生 warning
    existsMock.mockImplementation(async (path: string) => path !== '/source/assets/custom.png')

    await expect(engineManager.inspectEngine(AbsPath.from('/source'))).resolves.toMatchObject({
      availability: 'available',
      warnings: [{ code: 'missing-favicon' }],
    })
  })

  it('validateAllEngines 会把失效目录标记为 missing availability', async () => {
    enginesToArrayMock.mockResolvedValue([
      createTestEngine({
        id: 'engine-1',
        path: AbsPath.from('/engines/webgal'),
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
        path: AbsPath.from('/engines/WebGAL/4.5.0'),
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
        path: AbsPath.from('/engines/WebGAL/4.5.0'),
        previewAssets: {
          icon: { path: '/engines/WebGAL/4.5.0/icons/favicon.ico' },
        },
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

  it('validateAllEngines 会把 managed import 遗留的 staging 图标路径修正为最终目录', async () => {
    enginesToArrayMock.mockResolvedValue([
      createTestEngine({
        id: 'engine-1',
        path: AbsPath.from('/engines/WebGAL/4.6.2'),
        previewAssets: {
          icon: { path: '/engines/.import-staging/session/icons/favicon.ico' },
        },
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
        version: '4.6.2',
        engineType: 'official',
        webgalVersion: '4.6.2',
      },
    })

    await engineManager.validateAllEngines()

    expect(enginesUpdateMock).toHaveBeenCalledWith('engine-1', {
      previewAssets: {
        icon: {
          cacheVersion: expect.any(Number),
          path: '/engines/WebGAL/4.6.2/icons/favicon.ico',
        },
      },
    })
  })

  it('validateAllEngines 在结构有效但 schemaVersion 不受支持时标记为 broken', async () => {
    enginesToArrayMock.mockResolvedValue([
      createTestEngine({
        id: 'engine-1',
        path: AbsPath.from('/engines/WebGAL/4.5.0'),
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

  it('validateAllEngines 遇到多个 manifest 结构性问题时会返回失败摘要', async () => {
    enginesToArrayMock.mockResolvedValue([
      createTestEngine({
        id: 'engine-1',
        path: AbsPath.from('/engines/first'),
        status: 'created',
      }),
      createTestEngine({
        id: 'engine-2',
        path: AbsPath.from('/engines/second'),
        status: 'created',
      }),
    ])
    existsMock.mockResolvedValue(true)
    validateDirectoryStructureMock.mockResolvedValue(true)
    readEngineManifestMock.mockImplementation(async (path: AbsPath) => {
      if (path === '/engines/first') {
        return { reason: '缺少必填字段', status: 'invalid' }
      }
      return {
        schemaVersion: '2.0.0',
        status: 'unsupportedSchema',
        supportedMajor: 1,
      }
    })

    await expect(engineManager.validateAllEngines()).resolves.toEqual({
      failed: 2,
      failures: [
        { error: '缺少必填字段', path: '/engines/first' },
        { error: 'schemaVersion 2.0.0 不受支持，最高支持主版本 1', path: '/engines/second' },
      ],
      total: 2,
    })

    expect(enginesUpdateMock).toHaveBeenCalledWith('engine-1', { availability: 'broken' })
    expect(enginesUpdateMock).toHaveBeenCalledWith('engine-2', { availability: 'broken' })
  })

  it('validateAllEngines 遇到多个校验异常时会返回失败摘要', async () => {
    enginesToArrayMock.mockResolvedValue([
      createTestEngine({
        id: 'engine-1',
        path: AbsPath.from('/engines/first'),
        status: 'created',
      }),
      createTestEngine({
        id: 'engine-2',
        path: AbsPath.from('/engines/second'),
        status: 'created',
      }),
    ])
    existsMock.mockImplementation(async (path: string) => {
      if (path === '/engines/first') {
        throw new Error('disk unavailable')
      }
      throw new Error('permission denied')
    })

    await expect(engineManager.validateAllEngines()).resolves.toEqual({
      failed: 2,
      failures: [
        { error: 'Error: disk unavailable', path: '/engines/first' },
        { error: 'Error: permission denied', path: '/engines/second' },
      ],
      total: 2,
    })
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
      path: AbsPath.from('/engines/WebGAL/4.5.0'),
      version: '4.5.0',
    })
    const legacy = createTestEngine({
      id: 'engine-2',
      engineId: 'open-webgal.webgal',
      name: 'WebGAL',
      path: AbsPath.from('/engines/WebGAL/4.4.0'),
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
        path: AbsPath.from('/engines/WebGAL/4.5.0'),
        version: '4.5.0',
      }),
      createTestEngine({
        id: 'engine-2',
        name: 'WebGAL',
        path: AbsPath.from('/engines/WebGAL/4.4.0'),
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
