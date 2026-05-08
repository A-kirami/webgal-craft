import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { AbsPath } from '~/domain/path'

import DiscoveredResourcesModal from './DiscoveredResourcesModal.vue'

interface ThumbnailStubValue {
  width: number
  height: number
  resizeMode?: 'contain' | 'cover'
}

const {
  ensureServeUrlsMock,
  getServeUrlMock,
  usePreviewRuntimeStoreMock,
} = vi.hoisted(() => ({
  ensureServeUrlsMock: vi.fn(),
  getServeUrlMock: vi.fn(),
  usePreviewRuntimeStoreMock: vi.fn(),
}))

function createAssetImageStub() {
  return defineComponent({
    name: 'StubAssetImage',
    props: {
      alt: {
        type: String,
        default: undefined,
      },
      fallbackImage: {
        type: String,
        default: undefined,
      },
      path: {
        type: String,
        default: undefined,
      },
      thumbnail: {
        type: Object as PropType<ThumbnailStubValue | undefined>,
        default: undefined,
      },
    },
    setup(props, { attrs }) {
      return () => h('img', {
        ...attrs,
        'alt': props.alt,
        'data-fallback-image': props.fallbackImage,
        'data-path': props.path,
        'data-thumbnail': props.thumbnail === undefined ? undefined : JSON.stringify(props.thumbnail),
      })
    },
  })
}

vi.mock('~/stores/preview-runtime', () => ({
  usePreviewRuntimeStore: usePreviewRuntimeStoreMock,
}))

const globalStubs = {
  AssetImage: createAssetImageStub(),
  Button: createBrowserClickStub('StubButton'),
  CheckCircle2: createBrowserContainerStub('StubCheckCircle2'),
  Dialog: createBrowserContainerStub('StubDialog'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader'),
  DialogScrollContent: createBrowserContainerStub('StubDialogScrollContent'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle'),
}

describe('DiscoveredResourcesModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    getServeUrlMock.mockReturnValue('http://127.0.0.1:8899/game/demo/')
    usePreviewRuntimeStoreMock.mockReturnValue({
      ensureServeUrls: ensureServeUrlsMock,
      getServeUrl: getServeUrlMock,
    })
  })

  it('发现资源图标会请求固定 64x64 contain 缩略图', async () => {
    renderInBrowser(DiscoveredResourcesModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        resources: [
          {
            path: AbsPath.from('/games/demo'),
            name: 'Demo Game',
            icon: '/games/demo/icons/favicon.ico',
          },
        ],
        type: 'games',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const image = await page.getByAltText('Demo Game').element()
    expect(JSON.parse(image.dataset.thumbnail!)).toEqual({
      width: 64,
      height: 64,
      resizeMode: 'contain',
    })
  })

  it('发现资源图标会为预览失败场景提供可见回退图', async () => {
    renderInBrowser(DiscoveredResourcesModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        resources: [
          {
            path: AbsPath.from('/games/demo'),
            name: 'Demo Game',
            icon: '/games/demo/icons/favicon.ico',
          },
        ],
        type: 'games',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const image = await page.getByAltText('Demo Game').element()
    expect(image.dataset.fallbackImage).toBe('/placeholder.svg')
  })

  it('发现资源支持传入完整预览站点配置以保留 VFS lower', async () => {
    renderInBrowser(DiscoveredResourcesModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        resources: [
          {
            path: AbsPath.from('/games/demo'),
            name: 'Demo Game',
            icon: 'icons/favicon.ico',
            previewSite: {
              projectPath: AbsPath.from('/games/demo'),
              enginePath: AbsPath.from('/engines/webgal'),
            },
          },
        ],
        type: 'games',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await vi.waitFor(() => {
      expect(ensureServeUrlsMock).toHaveBeenCalledWith([{
        projectPath: '/games/demo',
        enginePath: '/engines/webgal',
      }])
    })
  })

  it('资源列表更新时会丢弃已移除路径，并默认选中新加入的资源而不重置现有取消选择', async () => {
    const ResourceSelectionHarness = defineComponent({
      name: 'ResourceSelectionHarness',
      setup() {
        const resources = ref([
          {
            path: AbsPath.from('/games/alpha'),
            name: 'Alpha Game',
            icon: '/games/alpha/icons/favicon.ico',
          },
          {
            path: AbsPath.from('/games/beta'),
            name: 'Beta Game',
            icon: '/games/beta/icons/favicon.ico',
          },
        ])

        function replaceResources() {
          resources.value = [
            {
              path: AbsPath.from('/games/beta'),
              name: 'Beta Game',
              icon: '/games/beta/icons/favicon.ico',
            },
            {
              path: AbsPath.from('/games/charlie'),
              name: 'Charlie Game',
              icon: '/games/charlie/icons/favicon.ico',
            },
          ]
        }

        return () => h('div', [
          h(DiscoveredResourcesModal, {
            open: true,
            resources: resources.value,
            type: 'games',
          }),
          h('button', {
            'type': 'button',
            'data-testid': 'replace-resources',
            'onClick': replaceResources,
          }, 'replace'),
        ])
      },
    })

    renderInBrowser(ResourceSelectionHarness, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByText('Beta Game').click()
    await page.getByTestId('replace-resources').click()
    await nextTick()

    await expect.element(page.getByText('Alpha Game')).not.toBeInTheDocument()

    const betaLabel = await page.getByText('Beta Game').element()
    const charlieLabel = await page.getByText('Charlie Game').element()
    const betaRow = betaLabel.closest('[class*="cursor-pointer"]')
    const charlieRow = charlieLabel.closest('[class*="cursor-pointer"]')

    expect(betaRow?.classList.contains('bg-accent')).toBe(false)
    expect(charlieRow?.classList.contains('bg-accent')).toBe(true)
  })

  it('模板资源不会请求预览运行时 serve url', async () => {
    renderInBrowser(DiscoveredResourcesModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        resources: [
          {
            path: AbsPath.from('/templates/modern'),
            name: 'Modern Template',
          },
        ],
        type: 'templates',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('Modern Template')).toBeVisible()
    expect(ensureServeUrlsMock).not.toHaveBeenCalled()
  })
})
