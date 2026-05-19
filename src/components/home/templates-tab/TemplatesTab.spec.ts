import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserClickStub, renderInBrowser } from '~/__tests__/browser-render'
import { AbsPath } from '~/domain/path'

import TemplatesTab from './TemplatesTab.vue'

import type { Engine } from '~/database/model'
import type { TemplateGroupViewModel } from '~/features/home/templates-tab/template-groups'

const {
  getServeUrlMock,
  importTemplateMock,
  modalOpenMock,
  notifyErrorMock,
  notifySuccessMock,
  openDialogMock,
  openPathMock,
  useModalStoreMock,
  usePreferenceStoreMock,
  usePreviewRuntimeStoreMock,
  useResourceStoreMock,
} = vi.hoisted(() => ({
  getServeUrlMock: vi.fn(),
  importTemplateMock: vi.fn(),
  modalOpenMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  openDialogMock: vi.fn(),
  openPathMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  usePreviewRuntimeStoreMock: vi.fn(),
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

vi.mock('~/services/template-manager', () => ({
  templateManager: {
    importTemplate: importTemplateMock,
  },
}))

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
  Button: createBrowserClickStub('StubButton'),
  TemplatesTabCollectionSection: defineComponent({
    name: 'StubTemplatesTabCollectionSection',
    props: {
      items: {
        type: Array,
        required: true,
      },
    },
    emits: ['deleteTemplate', 'drop', 'importClick', 'openSourceFolder'],
    setup(props, { emit }) {
      return () => h('div', [
        ...(props.items as {
          representativeEngineItem?: {
            serveUrl?: string
          }
          templateGroup: TemplateGroupViewModel
        }[]).map(item => h('article', {
          'key': item.templateGroup.key,
          'data-serve-url': item.representativeEngineItem?.serveUrl ?? '',
          'data-testid': `template-group-${item.templateGroup.key}`,
          'data-template-group-key': item.templateGroup.key,
        }, [
          h('h3', item.templateGroup.name),
          h('button', {
            type: 'button',
            onClick: () => emit('openSourceFolder', item.templateGroup.sources[0]),
          }, 'home.templates.actions.openTemplateFolder'),
          h('button', {
            type: 'button',
            onClick: () => emit('deleteTemplate', item.templateGroup),
          }, 'home.templates.deleteTemplate'),
        ])),
        h('button', {
          type: 'button',
          onClick: () => emit('importClick'),
        }, 'home.templates.importTemplate'),
      ])
    },
  }),
}

function createResourceStore() {
  const engines: Engine[] = []

  return reactive({
    activeProgress: new Map<string, number>(),
    engines,
    filteredEngines: engines,
    templateGroups: [
      {
        key: 'standalone:Modern Template',
        name: 'Modern Template',
        sourceKind: 'standalone',
        sources: [
          {
            kind: 'standalone',
            templateId: 'template-1',
            name: 'Modern Template',
            path: AbsPath.from('/templates/modern'),
            createdAt: 1,
          },
        ],
      },
    ] as TemplateGroupViewModel[],
    templates: [
      {
        id: 'template-1',
        path: AbsPath.from('/templates/modern'),
        pathLookupKey: '/templates/modern',
        createdAt: 1,
        status: 'created',
        metadata: {
          name: 'Modern Template',
        },
      },
    ],
  })
}

describe('TemplatesTab', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    getServeUrlMock.mockReturnValue(undefined)
    importTemplateMock.mockResolvedValue(undefined)
    openDialogMock.mockResolvedValue(undefined)
    useModalStoreMock.mockReturnValue({
      open: modalOpenMock,
    })
    usePreferenceStoreMock.mockReturnValue(reactive({
      viewMode: 'list' as const,
    }))
    usePreviewRuntimeStoreMock.mockReturnValue({
      getServeUrl: getServeUrlMock,
    })
  })

  it('点击导入按钮会选择目录并导入模板', async () => {
    useResourceStoreMock.mockReturnValue(createResourceStore())
    openDialogMock.mockResolvedValue('/templates/import-target')

    renderInBrowser(TemplatesTab, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'home.templates.importTemplate' }).click()

    await vi.waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledWith(expect.objectContaining({
        directory: true,
        multiple: false,
        title: 'common.dialogs.selectTemplateFolder',
      }))
      expect(importTemplateMock).toHaveBeenCalledWith('/templates/import-target')
      expect(notifySuccessMock).toHaveBeenCalledWith('home.templates.importSuccess')
    })
  })

  it('会打开模板目录并触发删除模板模态框', async () => {
    useResourceStoreMock.mockReturnValue(createResourceStore())

    renderInBrowser(TemplatesTab, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'home.templates.actions.openTemplateFolder' }).click()
    await page.getByRole('button', { name: 'home.templates.deleteTemplate' }).click()

    expect(openPathMock).toHaveBeenCalledWith('/templates/modern')
    expect(modalOpenMock).toHaveBeenCalledWith('DeleteTemplateModal', {
      template: expect.objectContaining({
        id: 'template-1',
      }),
    })
  })

  it('会为引擎内置模板组装代表引擎的 serveUrl', async () => {
    const store = createResourceStore()
    const engines: Engine[] = [
      {
        id: 'engine-1',
        engineId: 'open-webgal.webgal',
        createdAt: 2,
        metadata: {
          description: '',
          icon: 'icons/favicon.ico',
        },
        name: 'WebGAL',
        path: AbsPath.from('/engines/WebGAL/4.8.2'),
        pathLookupKey: '/engines/webgal/4.8.2',
        previewAssets: {
          icon: {
            path: 'icons/favicon.ico',
          },
        },
        status: 'created',
        availability: 'available',
        version: '4.8.2',
      },
    ]
    store.engines = engines
    store.filteredEngines = engines
    store.templateGroups = [
      {
        key: 'engineBuiltin:WebGAL',
        name: 'WebGAL',
        sourceKind: 'engineBuiltin',
        sources: [
          {
            kind: 'engineBuiltin',
            engineId: 'engine-1',
            engineName: 'WebGAL',
            enginePath: AbsPath.from('/engines/WebGAL/4.8.2'),
            engineVersion: '4.8.2',
            templatePath: AbsPath.from('/engines/WebGAL/4.8.2/game/template'),
            createdAt: 2,
          },
        ],
      },
    ] satisfies TemplateGroupViewModel[]
    getServeUrlMock.mockReturnValue('http://127.0.0.1:8899/game/engine/webgal/')
    useResourceStoreMock.mockReturnValue(store)

    renderInBrowser(TemplatesTab, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const article = await page.getByTestId('template-group-engineBuiltin:WebGAL').element()

    expect(getServeUrlMock).toHaveBeenCalledWith('/engines/WebGAL/4.8.2')
    expect(article.dataset.serveUrl).toBe('http://127.0.0.1:8899/game/engine/webgal/')
    expect(article.dataset.templateGroupKey).toBe('engineBuiltin:WebGAL')
  })
})
