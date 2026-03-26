import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { reactive, ref } from 'vue'

import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import { createTestEngine } from '~/__tests__/factories'
import { AppError } from '~/types/errors'

import EnginesTab from './EnginesTab.vue'

import type { Engine } from '~/database/model'

const {
  importEngineMock,
  modalOpenMock,
  notifyErrorMock,
  notifySuccessMock,
  openDialogMock,
  openPathMock,
  useModalStoreMock,
  usePreferenceStoreMock,
  useResourceStoreMock,
} = vi.hoisted(() => ({
  importEngineMock: vi.fn(),
  modalOpenMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  openDialogMock: vi.fn(),
  openPathMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  useResourceStoreMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: openPathMock,
}))

vi.mock('notivue', () => ({
  push: {
    error: notifyErrorMock,
    success: notifySuccessMock,
  },
}))

vi.mock('~/composables/useTauriDropZone', () => ({
  useTauriDropZone: () => ({
    files: ref<string[] | undefined>(undefined),
    isOverDropZone: ref(false),
  }),
}))

vi.mock('~/services/engine-manager', () => ({
  engineManager: {
    importEngine: importEngineMock,
  },
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  Card: createBrowserContainerStub('StubCard'),
  CardContent: createBrowserContainerStub('StubCardContent'),
  ContextMenu: createBrowserContainerStub('StubContextMenu'),
  ContextMenuContent: createBrowserContainerStub('StubContextMenuContent'),
  ContextMenuItem: createBrowserClickStub('StubContextMenuItem'),
  ContextMenuTrigger: createBrowserContainerStub('StubContextMenuTrigger'),
  Progress: createBrowserContainerStub('StubProgress'),
  Thumbnail: createBrowserContainerStub('StubThumbnail', 'img'),
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipProvider: createBrowserContainerStub('StubTooltipProvider'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
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

    importEngineMock.mockResolvedValue(undefined)
    openDialogMock.mockResolvedValue(undefined)
    useModalStoreMock.mockReturnValue({
      open: modalOpenMock,
    })
    usePreferenceStoreMock.mockReturnValue(reactive({
      viewMode: 'list' as const,
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
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
      expect(notifySuccessMock).toHaveBeenCalledWith('home.engines.importSuccess')
    })
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
      expect(notifyErrorMock).toHaveBeenCalledWith('home.engines.importInvalidFolder')
    })
  })

  it('列表视图操作按钮会打开引擎目录并触发卸载模态框', async () => {
    const engine = createTestEngine()

    useResourceStoreMock.mockReturnValue(createResourceStore({
      engines: [engine],
    }))

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

    await vi.waitFor(() => {
      expect(openPathMock).toHaveBeenCalledWith('/engines/default')
      expect(modalOpenMock).toHaveBeenCalledWith('DeleteEngineModal', { engine })
    })
  })
})
