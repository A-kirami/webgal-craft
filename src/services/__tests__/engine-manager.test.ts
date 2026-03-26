import { beforeEach, describe, expect, it, vi } from 'vitest'

import { engineManager } from '~/services/engine-manager'
import { AppError } from '~/types/errors'

const {
  copyDirectoryWithProgressMock,
  dbEnginesAddMock,
  dbEnginesDeleteMock,
  dbEnginesUpdateMock,
  deleteFileMock,
  engineIconPathMock,
  engineManifestPathMock,
  existsMock,
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
  deleteFileMock: vi.fn(),
  engineIconPathMock: vi.fn(),
  engineManifestPathMock: vi.fn(),
  existsMock: vi.fn(),
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
  exists: existsMock,
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
    deleteFile: deleteFileMock,
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

vi.mock('~/services/platform/app-paths', () => ({
  engineIconPath: engineIconPathMock,
  engineManifestPath: engineManifestPathMock,
}))

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

vi.mock('~/stores/storage-settings', () => ({
  useStorageSettingsStore: useStorageSettingsStoreMock,
}))

describe('engineManager 引擎管理', () => {
  beforeEach(() => {
    copyDirectoryWithProgressMock.mockReset()
    dbEnginesAddMock.mockReset()
    dbEnginesDeleteMock.mockReset()
    dbEnginesUpdateMock.mockReset()
    deleteFileMock.mockReset()
    engineIconPathMock.mockReset()
    engineManifestPathMock.mockReset()
    existsMock.mockReset()
    joinMock.mockClear()
    loggerInfoMock.mockReset()
    readTextFileMock.mockReset()
    removeMock.mockReset()
    resourceStoreMock.updateProgress.mockReset()
    resourceStoreMock.finishProgress.mockReset()
    validateDirectoryStructureMock.mockReset()
    useResourceStoreMock.mockReset()
    useStorageSettingsStoreMock.mockReset()
    useResourceStoreMock.mockReturnValue(resourceStoreMock)
    useStorageSettingsStoreMock.mockReturnValue(storageSettingsStoreState)
    existsMock.mockResolvedValue(false)
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
    engineIconPathMock.mockImplementation(async (path: string) => `${path}/icons/favicon.ico`)
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
        icon: '/engines/WebGAL/icons/favicon.ico',
        description: 'Visual novel engine',
      },
    }))
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(1, 'engine-1', 10)
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(2, 'engine-1', 100)
    expect(resourceStoreMock.finishProgress).toHaveBeenCalledWith('engine-1')
    expect(dbEnginesUpdateMock).toHaveBeenCalledWith('engine-1', { status: 'created' })
  })

  it('installEngine 在注册后失败时会回滚占位记录、进度和目标目录', async () => {
    engineIconPathMock.mockImplementation(async (path: string) => `${path}/icons/favicon.ico`)
    engineManifestPathMock.mockResolvedValue('/source/manifest.json')
    readTextFileMock.mockResolvedValue(JSON.stringify({
      name: 'WebGAL',
      description: 'Visual novel engine',
    }))
    dbEnginesAddMock.mockResolvedValue('engine-1')
    existsMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    copyDirectoryWithProgressMock.mockResolvedValue(undefined)
    dbEnginesUpdateMock.mockRejectedValue(new Error('update failed'))

    await expect(engineManager.installEngine('/source')).rejects.toThrow('update failed')

    expect(resourceStoreMock.finishProgress).toHaveBeenCalledWith('engine-1')
    expect(dbEnginesDeleteMock).toHaveBeenCalledWith('engine-1')
    expect(deleteFileMock).toHaveBeenCalledWith('/engines/WebGAL', true)
  })

  it('installEngine 在目标目录已存在且复制失败时不会删除既有目录', async () => {
    engineIconPathMock.mockImplementation(async (path: string) => `${path}/icons/favicon.ico`)
    engineManifestPathMock.mockResolvedValue('/source/manifest.json')
    readTextFileMock.mockResolvedValue(JSON.stringify({
      name: 'WebGAL',
      description: 'Visual novel engine',
    }))
    dbEnginesAddMock.mockResolvedValue('engine-1')
    existsMock.mockResolvedValue(true)
    copyDirectoryWithProgressMock.mockRejectedValue(new Error('copy failed'))

    await expect(engineManager.installEngine('/source')).rejects.toThrow('copy failed')

    expect(dbEnginesDeleteMock).toHaveBeenCalledWith('engine-1')
    expect(deleteFileMock).not.toHaveBeenCalled()
  })

  it('installEngine 遇到非法引擎名称时会拒绝安装', async () => {
    engineIconPathMock.mockResolvedValue('/source/icons/favicon.ico')
    engineManifestPathMock.mockResolvedValue('/source/manifest.json')
    readTextFileMock.mockResolvedValue(JSON.stringify({
      name: '',
      description: 'Visual novel engine',
    }))

    await expect(engineManager.installEngine('/source')).rejects.toEqual(
      new AppError('IO_ERROR', '引擎名称无效'),
    )

    expect(dbEnginesAddMock).not.toHaveBeenCalled()
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
  })

  it('importEngine 遇到非法目录结构时会抛出 INVALID_STRUCTURE', async () => {
    validateDirectoryStructureMock.mockResolvedValue(false)

    await expect(engineManager.importEngine('/broken-engine')).rejects.toEqual(
      new AppError('INVALID_STRUCTURE', '无效的引擎文件夹'),
    )
  })

  it('已位于目标目录的引擎会直接注册而不是重复复制', async () => {
    validateDirectoryStructureMock.mockResolvedValue(true)
    engineIconPathMock.mockImplementation(async (path: string) => `${path}/icons/favicon.ico`)
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
      metadata: expect.objectContaining({
        icon: '/engines/WebGAL/icons/favicon.ico',
      }),
    }))
  })

  it('uninstallEngine 会删除数据库记录并通过 fs 命令将引擎目录移动到回收站', async () => {
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

    expect(deleteFileMock).toHaveBeenCalledWith('/engines/WebGAL')
    expect(dbEnginesDeleteMock).toHaveBeenCalledWith('engine-1')
    expect(deleteFileMock.mock.invocationCallOrder[0]).toBeLessThan(dbEnginesDeleteMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY)
  })
})
