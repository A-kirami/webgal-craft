import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import { toLookupPathKey } from '~/services/resource-path/lookup'

const {
  classifyEngineMock,
  gameIdentityKeyOfMock,
  engineIdentityKeyOfMock,
  existsMock,
  getEnginePreviewAssetsMock,
  getTemplateMetadataMock,
  modalOpenMock,
  readDirMock,
  resolveHomeTabDefinitionMock,
  templateImportMock,
  useModalStoreMock,
  useResourceStoreMock,
  useStorageSettingsStoreMock,
  useWorkspaceStoreMock,
  validateEngineMock,
  validateTemplateMock,
} = vi.hoisted(() => ({
  classifyEngineMock: vi.fn(),
  gameIdentityKeyOfMock: vi.fn((resource: { path: AbsPath }) => toLookupPathKey(resource.path)),
  engineIdentityKeyOfMock: vi.fn((resource: { path: AbsPath, engineId?: string, version?: string }) =>
    resource.engineId && resource.version
      ? `${resource.engineId}:${resource.version}`
      : toLookupPathKey(resource.path),
  ),
  existsMock: vi.fn(),
  getEnginePreviewAssetsMock: vi.fn(),
  getTemplateMetadataMock: vi.fn(),
  modalOpenMock: vi.fn(),
  readDirMock: vi.fn(),
  resolveHomeTabDefinitionMock: vi.fn(),
  templateImportMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  useResourceStoreMock: vi.fn(),
  useStorageSettingsStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
  validateEngineMock: vi.fn(),
  validateTemplateMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
  readDir: readDirMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  attachConsole: vi.fn(),
}))

vi.mock('notivue', () => ({
  push: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('~/features/home/home-tabs', () => ({
  resolveHomeTabDefinition: resolveHomeTabDefinitionMock,
}))

vi.mock('~/features/modals/engine-selection/request-engine-selection', () => ({
  requestEngineSelection: vi.fn(),
}))

vi.mock('~/services/engine-manager', () => ({
  engineManager: {
    classifyEngine: classifyEngineMock,
    getEnginePreviewAssets: getEnginePreviewAssetsMock,
    identityKeyOf: engineIdentityKeyOfMock,
    importEngine: vi.fn(),
    validateEngine: validateEngineMock,
  },
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    getGamePreviewAssets: vi.fn(),
    identityKeyOf: gameIdentityKeyOfMock,
    importGame: vi.fn(),
    resolvePreviewSite: vi.fn(),
    validateGame: vi.fn(),
  },
}))

vi.mock('~/services/template-manager', () => ({
  templateManager: {
    getTemplateMetadata: getTemplateMetadataMock,
    importTemplate: templateImportMock,
    validateTemplate: validateTemplateMock,
  },
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

vi.mock('~/stores/storage-settings', () => ({
  useStorageSettingsStore: useStorageSettingsStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

describe('useDiscoverResources', () => {
  beforeEach(() => {
    vi.resetModules()

    classifyEngineMock.mockReset()
    gameIdentityKeyOfMock.mockClear()
    engineIdentityKeyOfMock.mockClear()
    existsMock.mockReset()
    getEnginePreviewAssetsMock.mockReset()
    getTemplateMetadataMock.mockReset()
    modalOpenMock.mockReset()
    readDirMock.mockReset()
    resolveHomeTabDefinitionMock.mockReset()
    templateImportMock.mockReset()
    useModalStoreMock.mockReset()
    useResourceStoreMock.mockReset()
    useStorageSettingsStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()
    validateEngineMock.mockReset()
    validateTemplateMock.mockReset()

    existsMock.mockResolvedValue(true)
    resolveHomeTabDefinitionMock.mockReturnValue({ discoveryType: 'engines' })
    useModalStoreMock.mockReturnValue({ open: modalOpenMock })
    useResourceStoreMock.mockReturnValue({
      engines: [],
      games: [],
      templates: [],
    })
    useStorageSettingsStoreMock.mockReturnValue({
      engineSavePath: '/engines',
      templateSavePath: '/templates',
    })
    useWorkspaceStoreMock.mockReturnValue({ activeTab: 'engines' })
    getEnginePreviewAssetsMock.mockResolvedValue({
      icon: {
        path: '/engines/WebGAL/4.5.0/icons/favicon.ico',
      },
    })
  })

  it('只会发现带有效 manifest 的受支持引擎目录', async () => {
    readDirMock.mockImplementation(async (path: string) => {
      switch (path) {
        case '/engines': {
          return [{ isDirectory: true, name: 'WebGAL' }]
        }
        case '/engines/WebGAL': {
          return [
            { isDirectory: true, name: '4.5.0' },
            { isDirectory: true, name: 'legacy' },
          ]
        }
        default: {
          return []
        }
      }
    })
    validateEngineMock.mockResolvedValue(true)
    classifyEngineMock.mockImplementation(async (path: string) => path.endsWith('/4.5.0')
      ? {
          status: 'ok',
          manifest: {
            id: 'webgal',
            name: 'WebGAL',
            version: '4.5.0',
          },
        }
      : { status: 'missing' })

    const { useDiscoverResources } = await import('../useDiscoverResources')
    const discoverResources = useDiscoverResources()

    await discoverResources.checkResourcesForActiveTab()

    expect(modalOpenMock).toHaveBeenCalledWith('DiscoveredResourcesModal', expect.objectContaining({
      type: 'engines',
      resources: [
        {
          icon: '/engines/WebGAL/4.5.0/icons/favicon.ico',
          name: 'WebGAL',
          path: '/engines/WebGAL/4.5.0',
          engineId: 'webgal',
          version: '4.5.0',
        },
      ],
    }))
    expect(classifyEngineMock).toHaveBeenCalledWith('/engines/WebGAL/4.5.0')
    expect(classifyEngineMock).toHaveBeenCalledWith('/engines/WebGAL/legacy')
  })

  it('会把 Windows 风格扫描目录归一化后再发现模板', async () => {
    resolveHomeTabDefinitionMock.mockReturnValue({ discoveryType: 'templates' })
    useWorkspaceStoreMock.mockReturnValue({ activeTab: 'templates' })
    useStorageSettingsStoreMock.mockReturnValue({
      engineSavePath: '/engines',
      templateSavePath: 'C:\\Templates\\',
    })
    readDirMock.mockImplementation(async (path: string) => {
      switch (path) {
        case 'C:\\Templates\\':
        case 'C:/Templates': {
          return [{ isDirectory: true, name: 'modern' }]
        }
        default: {
          return []
        }
      }
    })
    validateTemplateMock.mockResolvedValue(true)
    getTemplateMetadataMock.mockResolvedValue({
      name: 'Modern Template',
    })

    const { useDiscoverResources } = await import('../useDiscoverResources')
    const discoverResources = useDiscoverResources()

    await discoverResources.checkResourcesForActiveTab()

    expect(validateTemplateMock).toHaveBeenCalledWith('C:/Templates/modern')
    expect(getTemplateMetadataMock).toHaveBeenCalledWith('C:/Templates/modern')
  })

  it('会发现有效模板目录并使用模板元数据名称展示', async () => {
    resolveHomeTabDefinitionMock.mockReturnValue({ discoveryType: 'templates' })
    useWorkspaceStoreMock.mockReturnValue({ activeTab: 'templates' })
    readDirMock.mockImplementation(async (path: string) => {
      switch (path) {
        case '/templates': {
          return [
            { isDirectory: true, name: 'modern' },
            { isDirectory: true, name: 'invalid' },
          ]
        }
        default: {
          return []
        }
      }
    })
    validateTemplateMock.mockImplementation(async (path: string) => path.endsWith('/modern'))
    getTemplateMetadataMock.mockResolvedValue({
      name: 'Modern Template',
    })

    const { useDiscoverResources } = await import('../useDiscoverResources')
    const discoverResources = useDiscoverResources()

    await discoverResources.checkResourcesForActiveTab()

    expect(modalOpenMock).toHaveBeenCalledWith('DiscoveredResourcesModal', expect.objectContaining({
      type: 'templates',
      resources: [
        {
          name: 'Modern Template',
          path: '/templates/modern',
        },
      ],
    }))
    expect(validateTemplateMock).toHaveBeenCalledWith('/templates/modern')
    expect(validateTemplateMock).toHaveBeenCalledWith('/templates/invalid')
    expect(getTemplateMetadataMock).toHaveBeenCalledWith('/templates/modern')
    expect(getEnginePreviewAssetsMock).not.toHaveBeenCalled()
  })

  it('模板元数据读取失败时不会把坏模板展示到发现结果里', async () => {
    resolveHomeTabDefinitionMock.mockReturnValue({ discoveryType: 'templates' })
    useWorkspaceStoreMock.mockReturnValue({ activeTab: 'templates' })
    readDirMock.mockImplementation(async (path: string) => {
      switch (path) {
        case '/templates': {
          return [
            { isDirectory: true, name: 'modern' },
            { isDirectory: true, name: 'broken' },
          ]
        }
        default: {
          return []
        }
      }
    })
    validateTemplateMock.mockResolvedValue(true)
    getTemplateMetadataMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/broken')) {
        throw new Error('invalid template metadata')
      }
      return {
        name: 'Modern Template',
      }
    })

    const { useDiscoverResources } = await import('../useDiscoverResources')
    const discoverResources = useDiscoverResources()

    await discoverResources.checkResourcesForActiveTab()

    expect(modalOpenMock).toHaveBeenCalledWith('DiscoveredResourcesModal', expect.objectContaining({
      type: 'templates',
      resources: [
        {
          name: 'Modern Template',
          path: '/templates/modern',
        },
      ],
    }))
    expect(getTemplateMetadataMock).toHaveBeenCalledWith('/templates/modern')
    expect(getTemplateMetadataMock).toHaveBeenCalledWith('/templates/broken')
  })

  it('已导入同名模板时不会再次展示不同路径的重复模板', async () => {
    resolveHomeTabDefinitionMock.mockReturnValue({ discoveryType: 'templates' })
    useWorkspaceStoreMock.mockReturnValue({ activeTab: 'templates' })
    useResourceStoreMock.mockReturnValue({
      engines: [],
      games: [],
      templates: [
        {
          id: 'template-1',
          path: '/installed/Modern Template',
          createdAt: 0,
          status: 'created',
          metadata: {
            name: 'Modern Template',
          },
        },
      ],
    })
    readDirMock.mockImplementation(async (path: string) => {
      switch (path) {
        case '/templates': {
          return [{ isDirectory: true, name: 'modern-copy' }]
        }
        default: {
          return []
        }
      }
    })
    validateTemplateMock.mockResolvedValue(true)
    getTemplateMetadataMock.mockResolvedValue({
      name: 'Modern Template',
    })

    const { useDiscoverResources } = await import('../useDiscoverResources')
    const discoverResources = useDiscoverResources()

    await discoverResources.checkResourcesForActiveTab()

    expect(modalOpenMock).not.toHaveBeenCalled()
  })

  it('已导入同版本引擎时不会再次展示不同路径的重复引擎', async () => {
    useResourceStoreMock.mockReturnValue({
      engines: [
        {
          id: 'engine-1',
          path: '/installed/WebGAL/4.5.0',
          engineId: 'open-webgal.webgal',
          name: 'WebGAL',
          version: '4.5.0',
          createdAt: 0,
          status: 'created',
          metadata: {},
          previewAssets: {},
        },
      ],
      games: [],
      templates: [],
    })
    readDirMock.mockImplementation(async (path: string) => {
      switch (path) {
        case '/engines': {
          return [{ isDirectory: true, name: 'WebGAL Copy' }]
        }
        case '/engines/WebGAL Copy': {
          return [{ isDirectory: true, name: '4.5.0' }]
        }
        default: {
          return []
        }
      }
    })
    validateEngineMock.mockResolvedValue(true)
    classifyEngineMock.mockResolvedValue({
      status: 'ok',
      manifest: {
        id: 'open-webgal.webgal',
        name: 'WebGAL',
        version: '4.5.0',
      },
    })

    const { useDiscoverResources } = await import('../useDiscoverResources')
    const discoverResources = useDiscoverResources()

    await discoverResources.checkResourcesForActiveTab()

    expect(modalOpenMock).not.toHaveBeenCalled()
    expect(engineIdentityKeyOfMock).toHaveBeenCalled()
  })

  it('已导入同路径游戏时通过 gameManager.identityKeyOf 去重', async () => {
    const { gameManager } = await import('~/services/game-manager')
    vi.mocked(gameManager.validateGame).mockResolvedValue(true)
    vi.mocked(gameManager.getGamePreviewAssets).mockResolvedValue({
      icon: { path: 'icons/favicon.ico' },
      cover: { path: 'game/background/cover.png' },
    })
    vi.mocked(gameManager.resolvePreviewSite).mockResolvedValue({
      projectPath: AbsPath.from('/games/demo'),
    })
    resolveHomeTabDefinitionMock.mockReturnValue({ discoveryType: 'games' })
    useWorkspaceStoreMock.mockReturnValue({ activeTab: 'games' })
    useStorageSettingsStoreMock.mockReturnValue({
      engineSavePath: '/engines',
      gameSavePath: '/games',
      templateSavePath: '/templates',
    })
    useResourceStoreMock.mockReturnValue({
      engines: [],
      games: [
        {
          id: 'game-1',
          path: '/Games/Demo',
          pathLookupKey: '/games/demo',
          createdAt: 0,
          lastModified: 0,
          status: 'created',
          availability: 'available',
          metadata: { name: 'Demo Game' },
          previewAssets: {
            icon: { path: 'icons/favicon.ico' },
            cover: { path: 'game/background/cover.png' },
          },
        },
      ],
      templates: [],
    })
    readDirMock.mockImplementation(async (path: string) => {
      switch (path) {
        case '/games': {
          return [{ isDirectory: true, name: 'demo' }]
        }
        default: {
          return []
        }
      }
    })

    const { useDiscoverResources } = await import('../useDiscoverResources')
    const discoverResources = useDiscoverResources()

    await discoverResources.checkResourcesForActiveTab()

    expect(modalOpenMock).not.toHaveBeenCalled()
    expect(gameIdentityKeyOfMock).toHaveBeenCalled()
  })
})
