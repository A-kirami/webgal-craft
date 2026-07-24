import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import { createTestEngine } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'
import { AppError } from '~/types/errors'

import EnginesTab from './EnginesTab.vue'

import type { Engine } from '~/database/model'
import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'

const {
  getServeUrlMock,
  importEngineMock,
  modalOpenMock,
  toastErrorMock,
  toastSuccessMock,
  openDialogMock,
  openPathMock,
  useModalStoreMock,
  usePreviewRuntimeStoreMock,
  usePreferenceStoreMock,
  useResourceStoreMock,
} = vi.hoisted(() => ({
  getServeUrlMock: vi.fn(),
  importEngineMock: vi.fn(),
  modalOpenMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  openDialogMock: vi.fn(),
  openPathMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  usePreviewRuntimeStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  useResourceStoreMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: openPathMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: vi.fn(),
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

vi.mock('~/composables/useTauriDropZone', () => ({
  useTauriDropZone: () => ({
    files: ref<string[] | undefined>(undefined),
    isOverDropZone: ref(false),
  }),
}))

vi.mock('~/services/engine-manager', async (importActual) => {
  const actual = await importActual<typeof import('~/services/engine-manager')>()

  return {
    ...actual,
    engineManager: {
      ...actual.engineManager,
      importEngine: importEngineMock,
    },
  }
})

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/stores/preview-runtime', () => ({
  usePreviewRuntimeStore: usePreviewRuntimeStoreMock,
}))

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

const globalStubs = {
  AssetImage: createBrowserContainerStub('StubAssetImage', 'img'),
  Button: createBrowserClickStub('StubButton'),
  Card: createBrowserContainerStub('StubCard'),
  CardContent: createBrowserContainerStub('StubCardContent'),
  ContextMenu: createBrowserContainerStub('StubContextMenu'),
  ContextMenuContent: createBrowserContainerStub('StubContextMenuContent'),
  ContextMenuItem: createBrowserClickStub('StubContextMenuItem'),
  ContextMenuTrigger: createBrowserContainerStub('StubContextMenuTrigger'),
  Progress: createBrowserContainerStub('StubProgress'),
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipProvider: createBrowserContainerStub('StubTooltipProvider'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
  EnginesTabCollectionSection: defineComponent({
    name: 'StubEnginesTabCollectionSection',
    props: {
      groups: {
        type: Array,
        required: true,
      },
    },
    emits: ['deleteEngine', 'deleteGroup', 'drop', 'importClick', 'openGroupFolder', 'setDefaultEngine'],
    setup(props, { emit }) {
      return () => h('div', [
        ...(props.groups as EngineGroupCollectionItem[]).map(group => h('article', {
          'key': group.name,
          'data-group-name': group.name,
          'data-is-default': String(group.isDefault),
          'data-serve-url': group.representativeItem?.serveUrl ?? '',
          'data-testid': `engine-group-${group.name}`,
        }, [
          h('h3', group.name),
          h('button', {
            type: 'button',
            onClick: () => emit('openGroupFolder', group),
          }, 'common.openFolder'),
          h('button', {
            type: 'button',
            onClick: () => emit('deleteEngine', group.representativeItem?.engine),
          }, 'home.engines.uninstallEngine'),
          h('button', {
            type: 'button',
            onClick: () => emit('deleteGroup', group.engineId),
          }, 'engine.uninstallAllVersions'),
          h('button', {
            type: 'button',
            onClick: () => emit('setDefaultEngine', group.isDefault ? undefined : group.engineId),
          }, group.isDefault ? 'engine.unsetDefaultEngine' : 'engine.setDefaultEngine'),
        ])),
        /* empty state import button */
        h('button', {
          type: 'button',
          onClick: () => emit('importClick'),
        }, 'home.engines.installEngine'),
      ])
    },
  }),
}

function createResourceStore(options: {
  activeProgress?: Map<string, number>
  engines?: Engine[]
} = {}) {
  const activeProgress = options.activeProgress ?? new Map<string, number>()
  const engines = options.engines ?? []

  return reactive({
    activeProgress,
    engines,
    filteredEngines: engines,
    getProgress(id: string) {
      return activeProgress.get(id)
    },
  })
}

describe('EnginesTab', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    getServeUrlMock.mockReturnValue('http://127.0.0.1:8899/game/engine/')
    importEngineMock.mockResolvedValue(undefined)
    openDialogMock.mockResolvedValue(undefined)
    useModalStoreMock.mockReturnValue({
      open: modalOpenMock,
    })
    usePreviewRuntimeStoreMock.mockReturnValue({
      getServeUrl: getServeUrlMock,
    })
    usePreferenceStoreMock.mockReturnValue(reactive({
      defaultEngineId: 'open-webgal.webgal',
      viewMode: 'list' as const,
    }))
  })

  it('空状态下点击安装按钮会选择目录并导入引擎', async () => {
    useResourceStoreMock.mockReturnValue(createResourceStore({
      engines: [],
    }))
    openDialogMock.mockResolvedValue('/engines/import-target')

    renderInBrowser(EnginesTab, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'home.engines.installGameEngine' }).click()

    await vi.waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledWith(expect.objectContaining({
        directory: true,
        multiple: false,
        title: 'common.dialogs.selectEngineFolder',
      }))
      expect(importEngineMock).toHaveBeenCalledWith('/engines/import-target')
      expect(toastSuccessMock).not.toHaveBeenCalled()
    })
  })

  it('会预先组装包含默认状态与 representative serveUrl 的引擎族展示项', async () => {
    const engine = createTestEngine({
      engineId: 'open-webgal.webgal',
      name: 'WebGAL',
      path: AbsPath.from('/engines/WebGAL/4.5.0'),
      version: '4.5.0',
    })

    useResourceStoreMock.mockReturnValue(createResourceStore({
      engines: [engine],
    }))
    getServeUrlMock.mockReturnValue('http://127.0.0.1:8899/game/engine/custom/')

    renderInBrowser(EnginesTab, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const group = await page.getByTestId('engine-group-WebGAL').element()

    expect(getServeUrlMock).toHaveBeenCalledWith('/engines/WebGAL/4.5.0')
    expect(group.dataset.serveUrl).toBe('http://127.0.0.1:8899/game/engine/custom/')
    expect(group.dataset.isDefault).toBe('true')
  })

  it('导入非法引擎目录时会显示结构错误通知', async () => {
    useResourceStoreMock.mockReturnValue(createResourceStore({
      engines: [],
    }))
    openDialogMock.mockResolvedValue('/engines/import-target')
    importEngineMock.mockRejectedValue(new AppError('INVALID_STRUCTURE', 'invalid'))

    renderInBrowser(EnginesTab, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'home.engines.installGameEngine' }).click()

    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('home.engines.importInvalidFolder')
    })
  })

  it('列表视图操作按钮会打开引擎族目录、触发单版本卸载并支持整组操作', async () => {
    const engine = createTestEngine({
      engineId: 'open-webgal.webgal',
      name: 'WebGAL',
      path: AbsPath.from('/engines/WebGAL/4.5.0'),
      version: '4.5.0',
    })
    const preferenceStore = reactive({
      defaultEngineId: undefined as string | undefined,
      viewMode: 'list' as const,
    })

    useResourceStoreMock.mockReturnValue(createResourceStore({
      engines: [engine],
    }))
    usePreferenceStoreMock.mockReturnValue(preferenceStore)

    renderInBrowser(EnginesTab, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'common.openFolder' }).click()
    await page.getByRole('button', { name: 'home.engines.uninstallEngine' }).click()
    await page.getByRole('button', { name: 'engine.uninstallAllVersions' }).click()
    await page.getByRole('button', { name: 'engine.setDefaultEngine' }).click()

    await vi.waitFor(() => {
      expect(openPathMock).toHaveBeenCalledWith('/engines/WebGAL')
      expect(modalOpenMock).toHaveBeenCalledWith('DeleteEngineModal', { engine })
      expect(modalOpenMock).toHaveBeenCalledWith('DeleteEngineGroupModal', expect.objectContaining({ engineId: 'open-webgal.webgal' }))
    })
    expect(preferenceStore.defaultEngineId).toBe('open-webgal.webgal')
  })

  it('点击默认引擎的取消默认动作会清空默认引擎名', async () => {
    const engine = createTestEngine({
      engineId: 'open-webgal.webgal',
      name: 'WebGAL',
      path: AbsPath.from('/engines/WebGAL/4.5.0'),
      version: '4.5.0',
    })
    const preferenceStore = reactive({
      defaultEngineId: 'open-webgal.webgal' as string | undefined,
      viewMode: 'list' as const,
    })

    useResourceStoreMock.mockReturnValue(createResourceStore({
      engines: [engine],
    }))
    usePreferenceStoreMock.mockReturnValue(preferenceStore)

    renderInBrowser(EnginesTab, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'engine.unsetDefaultEngine' }).click()

    expect(preferenceStore.defaultEngineId).toBeUndefined()
  })
})
