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
  getConfigMock,
  getByLabelMock,
  loggerErrorMock,
  modalOpenMock,
  routerPushMock,
  toastErrorMock,
  useModalStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  getByLabelMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  modalOpenMock: vi.fn(),
  routerPushMock: vi.fn(),
  toastErrorMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: {
    getByLabel: getByLabelMock,
  },
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: loggerErrorMock,
  warn: vi.fn(),
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

vi.mock('~/services/config-manager', () => ({
  configManager: {
    getConfig: getConfigMock,
  },
}))

vi.mock('~/services/platform/app-paths', () => ({
  gameAssetDir: vi.fn(async (gamePath: string, assetType: string) => `${gamePath}/game/${assetType}`),
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastErrorMock,
  },
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
    getConfigMock.mockReset()
    getByLabelMock.mockReset()
    loggerErrorMock.mockReset()
    modalOpenMock.mockReset()
    routerPushMock.mockReset()
    toastErrorMock.mockReset()
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
        path: '/games/test',
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
      currentGameServeUrl: 'http://127.0.0.1:8899/game/test/',
    }))
    getConfigMock.mockResolvedValue({
      defaultLanguage: 'zh_CN',
      description: 'Intro',
      enableAppreciation: 'false',
      gameKey: 'demo-key',
      gameName: '测试游戏',
      titleImg: 'cover.webp',
      legacyExpressionBlendMode: 'false',
      lineHeight: '2.2',
      maxLine: '3',
      packageName: 'org.demo.game',
      gameLogo: 'opening.webp|enter.webp|',
      showPanic: 'true',
      steamAppId: '480',
      titleBgm: 'title.ogg',
    })
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

  it('当前游戏不可用时不显示游戏配置按钮', async () => {
    useWorkspaceStoreMock.mockReturnValue(reactive({
      CWD: String.raw`C:\Users\Akirami\Documents\WebGALCraft\games\test`,
      currentGame: undefined,
      currentGameServeUrl: undefined,
    }))

    renderInBrowser(EditHeader, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'edit.header.gameSettings' })).not.toBeInTheDocument()
  })

  it('打开游戏配置前会先预取配置，再带着准备好的数据打开模态框', async () => {
    renderInBrowser(EditHeader, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'edit.header.gameSettings' }).click()

    await vi.waitFor(() => {
      expect(getConfigMock).toHaveBeenCalledWith('/games/test')
      expect(modalOpenMock).toHaveBeenCalledWith('GameConfigModal', {
        backgroundRootPath: '/games/test/game/background',
        bgmRootPath: '/games/test/game/bgm',
        gamePath: '/games/test',
        initialValues: {
          defaultLanguage: 'zh_CN',
          description: 'Intro',
          enableAppreciation: false,
          gameKey: 'demo-key',
          gameLogo: ['opening.webp', 'enter.webp'],
          gameName: '测试游戏',
          legacyExpressionBlendMode: false,
          lineHeight: 2.2,
          maxLine: 3,
          packageName: 'org.demo.game',
          showPanic: true,
          steamAppId: '480',
          titleBgm: 'title.ogg',
          titleImg: 'cover.webp',
        },
        serveUrl: 'http://127.0.0.1:8899/game/test/',
      })
    })
  })

  it('预取游戏配置失败时会弹出错误提示，且不打开模态框', async () => {
    getConfigMock.mockRejectedValue(new Error('boom'))

    renderInBrowser(EditHeader, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'edit.header.gameSettings' }).click()

    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('modals.gameConfig.loadFailed')
    })
    expect(modalOpenMock).not.toHaveBeenCalled()
  })
})
