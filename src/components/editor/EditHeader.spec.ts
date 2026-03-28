import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, reactive } from 'vue'

import { createBrowserClickStub, renderInBrowser } from '~/__tests__/browser-render'

import EditHeader from './EditHeader.vue'

import type { PropType } from 'vue'

interface ThumbnailStubValue {
  width: number
  height: number
  resizeMode?: 'contain' | 'cover'
}

const {
  getByLabelMock,
  modalOpenMock,
  routerPushMock,
  useModalStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  getByLabelMock: vi.fn(),
  modalOpenMock: vi.fn(),
  routerPushMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: {
    getByLabel: getByLabelMock,
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPushMock,
  }),
}))

vi.mock('~/commands/window', () => ({
  windowCmds: {
    createWindow: vi.fn(),
  },
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: vi.fn(),
}))

function createAssetImageStub() {
  return defineComponent({
    name: 'StubAssetImage',
    props: {
      alt: {
        type: String,
        default: undefined,
      },
      path: {
        type: String,
        default: undefined,
      },
      rootPath: {
        type: String,
        default: undefined,
      },
      serveUrl: {
        type: String,
        default: undefined,
      },
      cacheVersion: {
        type: Number,
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
        'data-path': props.path,
        'data-root-path': props.rootPath,
        'data-serve-url': props.serveUrl,
        'data-cache-version': props.cacheVersion === undefined ? undefined : String(props.cacheVersion),
        'data-thumbnail': props.thumbnail === undefined ? undefined : JSON.stringify(props.thumbnail),
      })
    },
  })
}

const globalStubs = {
  AssetImage: createAssetImageStub(),
  Button: createBrowserClickStub('StubButton'),
}

describe('EditHeader', () => {
  beforeEach(() => {
    getByLabelMock.mockReset()
    modalOpenMock.mockReset()
    routerPushMock.mockReset()
    useModalStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    useModalStoreMock.mockReturnValue({
      open: modalOpenMock,
    })
    useWorkspaceStoreMock.mockReturnValue(reactive({
      CWD: String.raw`C:\Users\Akirami\Documents\WebGALCraft\games\test`,
      currentGame: {
        id: 'game-test',
        lastModified: 123,
        metadata: {
          name: '测试游戏',
        },
        previewAssets: {
          icon: {
            path: String.raw`C:\Users\Akirami\Documents\WebGALCraft\games\test\icons\favicon.ico`,
            cacheVersion: 456,
          },
        },
      },
      currentGameServeUrl: undefined,
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('会把当前工作区根路径传给顶部图标，避免预览地址未就绪时误报错', async () => {
    renderInBrowser(EditHeader, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const iconImage = await page.getByAltText('测试游戏 游戏图标').element()

    expect(iconImage.dataset.path).toBe(String.raw`C:\Users\Akirami\Documents\WebGALCraft\games\test\icons\favicon.ico`)
    expect(iconImage.dataset.rootPath).toBe(String.raw`C:\Users\Akirami\Documents\WebGALCraft\games\test`)
    expect(iconImage.dataset.cacheVersion).toBe('456')
    expect(iconImage.dataset.thumbnail).toBe(JSON.stringify({ width: 64, height: 64, resizeMode: 'contain' }))
  })
})
