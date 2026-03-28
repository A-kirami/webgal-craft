import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import DiscoveredResourcesModal from './DiscoveredResourcesModal.vue'

import type { PropType } from 'vue'

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
    ensureServeUrlsMock.mockReset()
    getServeUrlMock.mockReset()
    usePreviewRuntimeStoreMock.mockReset()

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
            path: '/games/demo',
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
    expect(image.dataset.thumbnail).toBe(JSON.stringify({
      width: 64,
      height: 64,
      resizeMode: 'contain',
    }))
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
            path: '/games/demo',
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
})
