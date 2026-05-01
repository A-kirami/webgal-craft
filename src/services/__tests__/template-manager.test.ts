import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { templateManager } from '~/services/template-manager'
import { AppError } from '~/types/errors'

const {
  copyDirectoryWithProgressMock,
  dbTemplatesAddMock,
  dbTemplatesDeleteMock,
  dbTemplatesFirstMock,
  dbTemplatesToArrayMock,
  dbTemplatesUpdateMock,
  deleteFileMock,
  existsMock,
  joinMock,
  readTextFileMock,
  resourceStoreMock,
  useResourceStoreMock,
  useStorageSettingsStoreMock,
  validateDirectoryStructureMock,
} = vi.hoisted(() => ({
  copyDirectoryWithProgressMock: vi.fn(),
  dbTemplatesAddMock: vi.fn(),
  dbTemplatesDeleteMock: vi.fn(),
  dbTemplatesFirstMock: vi.fn(),
  dbTemplatesToArrayMock: vi.fn(),
  dbTemplatesUpdateMock: vi.fn(),
  deleteFileMock: vi.fn(),
  existsMock: vi.fn(),
  joinMock: vi.fn(async (...parts: string[]) => parts.join('/').replaceAll('//', '/')),
  readTextFileMock: vi.fn(),
  resourceStoreMock: {
    finishProgress: vi.fn(),
    updateProgress: vi.fn(),
  },
  useResourceStoreMock: vi.fn(),
  useStorageSettingsStoreMock: vi.fn(),
  validateDirectoryStructureMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  join: joinMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  attachConsole: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
  readTextFile: readTextFileMock,
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
    templates: {
      add: dbTemplatesAddMock,
      delete: dbTemplatesDeleteMock,
      toArray: dbTemplatesToArrayMock,
      update: dbTemplatesUpdateMock,
      where: () => ({
        equals: () => ({
          first: dbTemplatesFirstMock,
        }),
      }),
    },
  },
}))

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

vi.mock('~/stores/storage-settings', () => ({
  useStorageSettingsStore: useStorageSettingsStoreMock,
}))

describe('templateManager 模板管理', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    dbTemplatesFirstMock.mockResolvedValue(undefined)
    dbTemplatesToArrayMock.mockResolvedValue([])
    existsMock.mockResolvedValue(false)
    useResourceStoreMock.mockReturnValue(resourceStoreMock)
    useStorageSettingsStoreMock.mockReturnValue({
      templateSavePath: '/templates',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('getTemplateMetadata 会读取 template.json 中的模板名称和兼容版本', async () => {
    readTextFileMock.mockResolvedValue(JSON.stringify({
      'name': 'Modern Template',
      'webgal-version': '4.8.1',
    }))

    await expect(templateManager.getTemplateMetadata('/source/template')).resolves.toEqual({
      name: 'Modern Template',
      webgalVersion: '4.8.1',
    })
  })

  it('importTemplate 会要求模板目录存在 template.json', async () => {
    validateDirectoryStructureMock.mockResolvedValue(false)

    await expect(templateManager.importTemplate('/source/template')).rejects.toEqual(
      new AppError('INVALID_STRUCTURE', '无效的模板文件夹'),
    )

    expect(validateDirectoryStructureMock).toHaveBeenCalledWith(
      '/source/template',
      [],
      ['template.json'],
    )
    expect(readTextFileMock).not.toHaveBeenCalled()
  })

  it('importTemplate 会复制到模板托管目录并写入数据库', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T00:00:00.000Z'))
    validateDirectoryStructureMock.mockResolvedValue(true)
    readTextFileMock.mockResolvedValue(JSON.stringify({
      'name': 'Modern Template',
      'webgal-version': '4.8.1',
    }))
    dbTemplatesAddMock.mockResolvedValue('template-1')
    copyDirectoryWithProgressMock.mockImplementation(async (_from, _to, onProgress: (progress: number) => void) => {
      onProgress(20)
      onProgress(100)
    })

    await templateManager.importTemplate('/source/template')

    expect(dbTemplatesAddMock).toHaveBeenCalledWith(expect.objectContaining({
      path: '/templates/Modern Template',
      status: 'creating',
      metadata: {
        name: 'Modern Template',
        webgalVersion: '4.8.1',
      },
    }))
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(1, 'template-1', 20)
    expect(resourceStoreMock.updateProgress).toHaveBeenNthCalledWith(2, 'template-1', 100)
    expect(dbTemplatesUpdateMock).toHaveBeenCalledWith('template-1', {
      status: 'created',
    })
    expect(resourceStoreMock.finishProgress).toHaveBeenCalledWith('template-1')
  })

  it('importTemplate 遇到同名模板时拒绝导入', async () => {
    validateDirectoryStructureMock.mockResolvedValue(true)
    readTextFileMock.mockResolvedValue(JSON.stringify({
      name: 'Modern Template',
    }))
    dbTemplatesFirstMock.mockResolvedValue({
      id: 'existing-template',
      path: '/templates/Modern Template',
      createdAt: 0,
      status: 'created',
      metadata: {
        name: 'Modern Template',
      },
    })

    await expect(templateManager.importTemplate('/source/template')).rejects.toEqual(
      new AppError('DUPLICATE_RESOURCE', '同名模板已存在'),
    )
  })

  it('importTemplate 遇到已存在的目标目录时拒绝导入', async () => {
    validateDirectoryStructureMock.mockResolvedValue(true)
    readTextFileMock.mockResolvedValue(JSON.stringify({
      name: 'Modern Template',
    }))
    existsMock.mockImplementation(async (path: string) => path === '/templates/Modern Template')

    await expect(templateManager.importTemplate('/source/template')).rejects.toEqual(
      new AppError('IO_ERROR', '目标模板目录已存在，请先清理后重试'),
    )
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
  })

  it('importTemplate 会用可比较路径判断是否已在目标位置', async () => {
    validateDirectoryStructureMock.mockResolvedValue(true)
    readTextFileMock.mockResolvedValue(JSON.stringify({
      name: 'Modern Template',
    }))
    dbTemplatesAddMock.mockResolvedValue('template-1')
    useStorageSettingsStoreMock.mockReturnValue({
      templateSavePath: 'C:/Templates',
    })
    joinMock.mockResolvedValue('c:/templates/Modern Template')

    await templateManager.importTemplate('C:\\Templates\\Modern Template\\')

    expect(dbTemplatesAddMock).toHaveBeenCalledWith(expect.objectContaining({
      path: 'C:\\Templates\\Modern Template\\',
      status: 'created',
    }))
    expect(copyDirectoryWithProgressMock).not.toHaveBeenCalled()
  })

  it('validateAllTemplates 会移除 creating 残留记录并清理目录', async () => {
    dbTemplatesToArrayMock.mockResolvedValue([
      {
        id: 'template-creating',
        path: '/templates/Modern Template',
        createdAt: 0,
        status: 'creating',
        metadata: {
          name: 'Modern Template',
        },
      },
    ])
    existsMock.mockImplementation(async (path: string) => path === '/templates/Modern Template')

    await templateManager.validateAllTemplates()

    expect(deleteFileMock).toHaveBeenCalledWith('/templates/Modern Template', true)
    expect(dbTemplatesDeleteMock).toHaveBeenCalledWith('template-creating')
  })

  it('validateAllTemplates 会把结构无效的已创建模板标记为 broken', async () => {
    dbTemplatesToArrayMock.mockResolvedValue([
      {
        id: 'template-created',
        path: '/templates/Broken Template',
        createdAt: 0,
        status: 'created',
        availability: 'available',
        metadata: {
          name: 'Broken Template',
        },
      },
    ])
    validateDirectoryStructureMock.mockResolvedValue(false)
    existsMock.mockImplementation(async (path: string) => path === '/templates/Broken Template')

    await templateManager.validateAllTemplates()

    expect(dbTemplatesUpdateMock).toHaveBeenCalledWith('template-created', { availability: 'broken' })
    expect(dbTemplatesDeleteMock).not.toHaveBeenCalled()
    expect(deleteFileMock).not.toHaveBeenCalled()
  })

  it('validateAllTemplates 会把路径不存在的已创建模板标记为 missing', async () => {
    dbTemplatesToArrayMock.mockResolvedValue([
      {
        id: 'template-created',
        path: '/templates/Missing Template',
        createdAt: 0,
        status: 'created',
        availability: 'available',
        metadata: {
          name: 'Missing Template',
        },
      },
    ])
    existsMock.mockResolvedValue(false)

    await templateManager.validateAllTemplates()

    expect(dbTemplatesUpdateMock).toHaveBeenCalledWith('template-created', { availability: 'missing' })
    expect(dbTemplatesDeleteMock).not.toHaveBeenCalled()
  })

  it('validateAllTemplates 会从 template.json 回刷兼容版本元数据', async () => {
    dbTemplatesToArrayMock.mockResolvedValue([
      {
        id: 'template-created',
        path: '/templates/Modern Template',
        createdAt: 0,
        status: 'created',
        availability: 'available',
        metadata: {
          name: 'Modern Template',
        },
      },
    ])
    validateDirectoryStructureMock.mockResolvedValue(true)
    existsMock.mockImplementation(async (path: string) => path === '/templates/Modern Template')
    readTextFileMock.mockResolvedValue(JSON.stringify({
      'name': 'Modern Template',
      'webgal-version': '4.8.1',
    }))

    await templateManager.validateAllTemplates()

    expect(dbTemplatesUpdateMock).toHaveBeenCalledWith('template-created', {
      metadata: {
        name: 'Modern Template',
        webgalVersion: '4.8.1',
      },
    })
  })

  it('validateAllTemplates 在元数据读取失败时会标记 broken 并保留记录', async () => {
    dbTemplatesToArrayMock.mockResolvedValue([
      {
        id: 'template-created',
        path: '/templates/Broken Metadata',
        createdAt: 0,
        status: 'created',
        availability: 'available',
        metadata: {
          name: 'Broken Metadata',
        },
      },
    ])
    validateDirectoryStructureMock.mockResolvedValue(true)
    existsMock.mockImplementation(async (path: string) => path === '/templates/Broken Metadata')
    readTextFileMock.mockRejectedValueOnce(new Error('invalid template.json'))

    await templateManager.validateAllTemplates()

    expect(dbTemplatesUpdateMock).toHaveBeenCalledWith('template-created', { availability: 'broken' })
    expect(dbTemplatesDeleteMock).not.toHaveBeenCalled()
    expect(deleteFileMock).not.toHaveBeenCalled()
  })

  it('deleteTemplate 会递归删除模板目录并清理数据库记录', async () => {
    await templateManager.deleteTemplate({
      id: 'template-created',
      path: '/templates/Modern Template',
      createdAt: 0,
      status: 'created',
      availability: 'available',
      metadata: {
        name: 'Modern Template',
      },
    })

    expect(deleteFileMock).toHaveBeenCalledWith('/templates/Modern Template', true)
    expect(dbTemplatesDeleteMock).toHaveBeenCalledWith('template-created')
  })

  it('deleteTemplate 在目录删除失败时仍会清理数据库记录', async () => {
    deleteFileMock.mockRejectedValueOnce(new Error('permission denied'))

    await expect(templateManager.deleteTemplate({
      id: 'template-created',
      path: '/templates/Modern Template',
      createdAt: 0,
      status: 'created',
      availability: 'available',
      metadata: {
        name: 'Modern Template',
      },
    })).resolves.toBeUndefined()

    expect(deleteFileMock).toHaveBeenCalledWith('/templates/Modern Template', true)
    expect(dbTemplatesDeleteMock).toHaveBeenCalledWith('template-created')
  })
})
