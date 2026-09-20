import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserLocalizedI18n } from '~/__tests__/browser'
import { renderInBrowser } from '~/__tests__/browser-render'

const {
  dayjsMock,
  dbEngineGetMock,
  dbEngineWhereFirstMock,
  getImageDimensionsMock,
  getLanguageDisplayNameMock,
  readProjectConfigMock,
  useEditorStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  dayjsMock: vi.fn(),
  dbEngineGetMock: vi.fn(),
  dbEngineWhereFirstMock: vi.fn(),
  getImageDimensionsMock: vi.fn(),
  getLanguageDisplayNameMock: vi.fn(),
  readProjectConfigMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('~/stores/editor', () => ({
  isAnimationVisualProjection: (state: { kind?: string, projection?: string }) =>
    state.kind === 'animation' && state.projection === 'visual',
  isEditableEditor: (state: { view?: string }) => state.view !== 'preview',
  isSceneVisualProjection: (state: { kind?: string, projection?: string }) =>
    state.kind === 'scene' && state.projection === 'visual',
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/commands/fs', () => ({
  fsCmds: {
    getImageDimensions: getImageDimensionsMock,
  },
}))

vi.mock('~/database/db', () => ({
  db: {
    engines: {
      get: dbEngineGetMock,
      where: () => ({
        equals: () => ({
          first: dbEngineWhereFirstMock,
        }),
      }),
    },
  },
}))

vi.mock('~/commands/project-config', () => ({
  projectConfigCmds: {
    readProjectConfig: readProjectConfigMock,
  },
}))

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: () => ({
    emit: vi.fn(),
    on: vi.fn(() => () => undefined),
    reset: vi.fn(),
  }),
}))

vi.mock('~/plugins/dayjs', () => ({
  default: dayjsMock,
  setDayjsLocale: vi.fn(),
}))

vi.mock('~/plugins/editor', () => ({
  getLanguageDisplayName: getLanguageDisplayNameMock,
  BASE_EDITOR_OPTIONS: {},
  THEME_DARK: 'webgal-dark',
  THEME_LIGHT: 'webgal-light',
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

const resourceIndexStatus = shallowRef<'idle' | 'building' | 'ready' | 'degraded'>('idle')

vi.mock('~/services/resource-index/service', () => ({
  useResourceIndex: () => ({
    status: resourceIndexStatus,
  }),
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: vi.fn(),
}))

import EditorStatusBar from './EditorStatusBar.vue'

function createEditorStatusBarLocalizedI18n() {
  return createBrowserLocalizedI18n({
    messages: {
      'zh-Hans': {
        common: {
          saved: '已保存',
          unsaved: '未保存',
        },
        edit: {
          assetPanel: {
            tabs: {
              template: '模板',
            },
          },
          statusBar: {
            engineMissing: '引擎不可用',
            frames: '{count} 帧',
            resourceIndexBuilding: '正在构建资源索引',
            resourceIndexUnavailable: '资源索引不可用',
            selectEngine: '选择引擎',
            selectTemplate: '选择模板',
            statements: '{count} 条语句',
            templateMissing: '模板不可用',
          },
          textEditor: {
            languages: {
              webgalanimation: 'WebGAL 动画',
              webgalscript: 'WebGAL 脚本',
            },
            stats: {
              lines: '{count} 行',
              words: '{count} 字',
            },
          },
        },
      },
    },
  })
}

function createEditorStore() {
  return reactive({
    currentState: undefined as Record<string, unknown> | undefined,
    currentTextProjection: undefined as Record<string, unknown> | undefined,
  })
}

function renderEditorStatusBar() {
  renderInBrowser(EditorStatusBar, {
    global: {
      plugins: [createEditorStatusBarLocalizedI18n()],
    },
  })
}

describe('EditorStatusBar', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    resourceIndexStatus.value = 'idle'

    dayjsMock.mockReturnValue({
      fromNow: () => 'just now',
    })
    dbEngineGetMock.mockResolvedValue({
      id: 'engine-1',
      path: '/engines/webgal',
    })
    dbEngineWhereFirstMock.mockResolvedValue(undefined)
    readProjectConfigMock.mockResolvedValue({ version: 1 })
    getLanguageDisplayNameMock.mockReturnValue('Markdown')
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        id: 'game-1',
        path: '/games/demo',
      },
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('会显示文本编辑器的保存状态、语言与行词统计', async () => {
    const editorStore = createEditorStore()
    editorStore.currentState = {
      isDirty: false,
      kind: 'scene',
      lastSavedTime: '2026-03-20T10:00:00.000Z',
      path: '/project/scene.txt',
      projection: 'text',
      textContent: 'hello world\nnext line',
    }
    editorStore.currentTextProjection = {
      syncError: undefined,
    }

    useEditorStoreMock.mockReturnValue(editorStore)

    renderEditorStatusBar()

    await expect.element(page.getByText('已保存')).toBeVisible()
    await expect.element(page.getByText('just now')).toBeVisible()
    await expect.element(page.getByText('WebGAL 脚本')).toBeVisible()
    await expect.element(page.getByText('2 行')).toBeVisible()
    await expect.element(page.getByText('4 字')).toBeVisible()
  })

  it('资源预览模式会显示图片尺寸和文件大小', async () => {
    const editorStore = createEditorStore()
    editorStore.currentState = {
      fileSize: 2048,
      mimeType: 'image/png',
      path: '/project/background.png',
      view: 'preview',
    }

    getImageDimensionsMock.mockResolvedValue([1280, 720])
    useEditorStoreMock.mockReturnValue(editorStore)

    renderEditorStatusBar()

    await expect.element(page.getByText('1280 × 720')).toBeVisible()
    await expect.element(page.getByText('2.0 KiB')).toBeVisible()
    expect(getImageDimensionsMock).toHaveBeenCalledWith('/project/background.png')
  })

  it('资源索引持续构建超过延迟后才显示状态', async () => {
    vi.useFakeTimers()
    resourceIndexStatus.value = 'building'
    useEditorStoreMock.mockReturnValue(createEditorStore())

    renderEditorStatusBar()

    await expect.element(page.getByText('正在构建资源索引')).not.toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(299)
    await expect.element(page.getByText('正在构建资源索引')).not.toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(1)
    await expect.element(page.getByText('正在构建资源索引')).toBeVisible()
  })

  it('资源索引在显示延迟内就绪时不显示状态', async () => {
    vi.useFakeTimers()
    resourceIndexStatus.value = 'building'
    useEditorStoreMock.mockReturnValue(createEditorStore())

    renderEditorStatusBar()

    resourceIndexStatus.value = 'ready'
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)

    await expect.element(page.getByText('正在构建资源索引')).not.toBeInTheDocument()
  })

  it('资源索引不可用时持续显示警告状态', async () => {
    resourceIndexStatus.value = 'degraded'
    useEditorStoreMock.mockReturnValue(createEditorStore())

    renderEditorStatusBar()

    await expect.element(page.getByText('资源索引不可用')).toBeVisible()

    resourceIndexStatus.value = 'ready'
    await expect.element(page.getByText('资源索引不可用')).not.toBeInTheDocument()
  })

  it('已绑定引擎时状态栏显示引擎名与版本', async () => {
    dbEngineGetMock.mockResolvedValue({
      availability: 'available',
      id: 'engine-1',
      name: 'WebGAL',
      path: '/engines/webgal',
      status: 'created',
      version: '4.6.2',
    })
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: { engineId: 'engine-1', id: 'game-1', path: '/games/demo' },
    }))
    useEditorStoreMock.mockReturnValue(createEditorStore())

    renderEditorStatusBar()

    await expect.element(page.getByText('WebGAL 4.6.2')).toBeVisible()
    await expect.element(page.getByText('引擎不可用')).not.toBeInTheDocument()
  })

  it('绑定引擎不可用时保留引擎与模板入口并提示不可用', async () => {
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: { engineId: 'engine-1', id: 'game-1', path: '/games/demo' },
    }))
    useEditorStoreMock.mockReturnValue(createEditorStore())

    renderEditorStatusBar()

    await expect.element(page.getByText('引擎不可用')).toBeVisible()
    await expect.element(page.getByText('模板不可用')).toBeVisible()
  })

  it('模板绑定在不可用的引擎内建模板上时入口不会消失', async () => {
    dbEngineWhereFirstMock.mockResolvedValue({
      availability: 'unavailable',
      id: 'engine-builtin',
      name: 'WebGAL',
      status: 'created',
      version: '4.6.2',
    })
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      template: {
        engine: {
          id: 'default-publisher.default-engine',
          version: '4.6.2',
        },
        kind: 'engineBuiltin',
      },
    })
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: { engineId: 'engine-1', id: 'game-1', path: '/games/demo' },
    }))
    useEditorStoreMock.mockReturnValue(createEditorStore())

    renderEditorStatusBar()

    await expect.element(page.getByText('模板不可用')).toBeVisible()
  })

  it('模板绑定的引擎记录已消失时模板入口进入警告态而引擎入口保持正常', async () => {
    dbEngineGetMock.mockResolvedValue({
      availability: 'available',
      id: 'engine-1',
      name: 'WebGAL',
      path: '/engines/webgal',
      status: 'created',
      version: '4.6.2',
    })
    dbEngineWhereFirstMock.mockResolvedValue(undefined)
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      template: {
        engine: {
          id: 'default-publisher.default-engine',
          version: '4.5.0',
        },
        kind: 'engineBuiltin',
      },
    })
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: { engineId: 'engine-1', id: 'game-1', path: '/games/demo' },
    }))
    useEditorStoreMock.mockReturnValue(createEditorStore())

    renderEditorStatusBar()

    await expect.element(page.getByRole('button', { name: '选择模板' })).toHaveClass('text-yellow-600')
    await expect.element(page.getByRole('button', { name: '选择引擎' })).not.toHaveClass('text-yellow-600')
  })
})
