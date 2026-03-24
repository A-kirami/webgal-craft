import { beforeEach, describe, expect, it, vi } from 'vitest'

import { engineManager } from '~/services/engine-manager'
import { AppError } from '~/types/errors'

const {
  copyDirectoryWithProgressMock,
  dbEnginesAddMock,
  dbEnginesDeleteMock,
  dbEnginesUpdateMock,
  engineIconPathMock,
  engineManifestPathMock,
  joinMock,
  loggerInfoMock,
  readTextFileMock,
  removeMock,
  resourceStoreMock,
  useResourceStoreMock,
  useStorageSettingsStoreMock,
  validateDirectoryStructureMock,
} = vi.hoisted(() => ({
  copyDirectoryWithProgressMock: vi.fn(),
  dbEnginesAddMock: vi.fn(),
  dbEnginesDeleteMock: vi.fn(),
  dbEnginesUpdateMock: vi.fn(),
  engineIconPathMock: vi.fn(),
  engineManifestPathMock: vi.fn(),
  joinMock: vi.fn(async (...parts: string[]) => parts.join('/').replaceAll('//', '/')),
  loggerInfoMock: vi.fn(),
  readTextFileMock: vi.fn(),
  removeMock: vi.fn(),
  resourceStoreMock: {
    updateProgress: vi.fn(),
    finishProgress: vi.fn(),
  },
  useResourceStoreMock: vi.fn(),
  useStorageSettingsStoreMock: vi.fn(),
  validateDirectoryStructureMock: vi.fn(),
}))

const storageSettingsStoreState = {
  engineSavePath: '/engines',
}

vi.mock('@tauri-apps/api/path', () => ({
  join: joinMock,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: readTextFileMock,
  remove: removeMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  info: loggerInfoMock,
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  attachConsole: vi.fn(),
}))

vi.mock('~/commands/fs', () => ({
  fsCmds: {
    validateDirectoryStructure: validateDirectoryStructureMock,
    copyDirectoryWithProgress: copyDirectoryWithProgressMock,
  },
}))

vi.mock('../commands/fs', () => ({
  fsCmds: {
    validateDirectoryStructure: validateDirectoryStructureMock,
    copyDirectoryWithProgress: copyDirectoryWithProgressMock,
  },
}))

vi.mock('~/database/db', () => ({
  db: {
    engines: {
      add: dbEnginesAddMock,
      update: dbEnginesUpdateMock,
      delete: dbEnginesDeleteMock,
    },
  },
}))

vi.mock('../database/db', () => ({
  db: {
    engines: {
      add: dbEnginesAddMock,
      update: dbEnginesUpdateMock,
      delete: dbEnginesDeleteMock,
    },
  },
}))

vi.mock('~/helper/app-paths', () => ({
  engineIconPath: engineIconPathMock,
  engineManifestPath: engineManifestPathMock,
}))

vi.mock('../helper/app-paths', () => ({
  engineIconPath: engineIconPathMock,
  engineManifestPath: engineManifestPathMock,
}))

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

vi.mock('../stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

vi.mock('~/stores/storage-settings', () => ({
  useStorageSettingsStore: useStorageSettingsStoreMock,
}))

vi.mock('../stores/storage-settings', () => ({
  useStorageSettingsStore: useStorageSettingsStoreMock,
}))

describe('engineManager', () => {
  beforeEach(() => {
    copyDirectoryWithProgressMock.mockReset()
    dbEnginesAddMock.mockReset()
    dbEnginesDeleteMock.mockReset()
    dbEnginesUpdateMock.mockReset()
    engineIconPathMock.mockReset()
    engineManifestPathMock.mockReset()
    joinMock.mockClear()
    loggerInfoMock.mockReset()
    readTextFileMock.mockReset()
    removeMock.mockReset()
    resourceStoreMock.updateProgress.mockReset()
    resourceStoreMock.finishProgress.mockReset()
    validateDirectoryStructureMock.mockReset()
    useResourceStoreMock.mockReturnValue(resourceStoreMock)
    useStorageSettingsStoreMock.mockReturnValue(storageSettingsStoreState)
  })

  it('getEngineMetadata 会读取 manifest 并组合图标路径', async () => {
    engineIconPathMock.mockResolvedValue('/engines/WebGAL/icons/icon.png')
    engineManifestPathMock.mockResolvedValue('/engines/WebGAL/manifest.json')
    readTextFileMock.mockResolvedValue(JSON.stringify({
      name: 'WebGAL',
      description: 'Visual novel engine',
    }))

    await expect(engineManager.getEngineMetadata('/engines/WebGAL')).resolves.toEqual({
      name: 'WebGAL',
      icon: '/engines/WebGAL/icons/icon.png',
      description: 'Visual novel engine',
    })
  })

  it('installEngine 会复制到存储目录并在完成后更新数据库状态', async () => {
    engineIconPathMock.mockResolvedValue('/source/icons/icon.png')
    engineManifestPathMock.mockResolvedValue('/source/manifest.json')
    readTextFileMock.mockResolvedValue(JSON.stringify({
      name: 'WebGAL',
      description: 'Visual novel engine',
    }))
    dbEnginesAddMock.mockResolvedValue('engine-1')
    copyDirectoryWithProgressMock.mockImplementation(async (_from, _to, onProgress: (progress: number) => void) => {
      onProgress(10)
      onProgress(100)
    })

    await engineManager.installEngine('/source')

    expect(dbEnginesAddMock).toHaveBeenCalledWith(expect.objectContaining({
      path: '/engines/WebGAL',
      status: 'creating',
      metadata: {
        name: 'WebGAL',
        icon: '/source/icons/icon.png',
        description: 'Visual novel engine',
      },
    }))
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(1, 'engine-1', 10)
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(2, 'engine-1', 100)
    expect(resourceStoreMock.finishProgress).toHaveBeenCalledWith('engine-1')
    expect(dbEnginesUpdateMock).toHaveBeenCalledWith('engine-1', { status: 'created' })
  })

  it('importEngine 遇到非法目录结构时会抛出 INVALID_STRUCTURE', async () => {
    validateDirectoryStructureMock.mockResolvedValue(false)

    await expect(engineManager.importEngine('/broken-engine')).rejects.toEqual(
      new AppError('INVALID_STRUCTURE', '无效的引擎文件夹'),
    )
  })

  it('已位于目标目录的引擎会直接注册而不是重复复制', async () => {
    validateDirectoryStructureMock.mockResolvedValue(true)
    engineIconPathMock.mockResolvedValue('/engines/WebGAL/icons/icon.png')
    engineManifestPathMock.mockResolvedValue('/engines/WebGAL/manifest.json')
    readTextFileMock.mockResolvedValue(JSON.stringify({
      name: 'WebGAL',
      description: 'Visual novel engine',
    }))

    await engineManager.importEngine('/engines/WebGAL')

    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
    expect(dbEnginesAddMock).toHaveBeenCalledWith(expect.objectContaining({
      path: '/engines/WebGAL',
      status: 'created',
    }))
  })

  it('uninstallEngine 会删除数据库记录和磁盘目录', async () => {
    await engineManager.uninstallEngine({
      id: 'engine-1',
      path: '/engines/WebGAL',
      createdAt: 0,
      status: 'created',
      metadata: {
        name: 'WebGAL',
        icon: '',
        description: '',
      },
    })

    expect(dbEnginesDeleteMock).toHaveBeenCalledWith('engine-1')
    expect(removeMock).toHaveBeenCalledWith('/engines/WebGAL', { recursive: true })
  })
})
