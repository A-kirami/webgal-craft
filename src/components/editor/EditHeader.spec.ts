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
  collectDocumentPathsUnderMock,
  getConfigMock,
  getDirtyBufferContentMock,
  getByLabelMock,
  hasUnsavedDocumentsUnderMock,
  loggerErrorMock,
  modalOpenMock,
  routerPushMock,
  saveFileMock,
  toastErrorMock,
  useEditorStoreMock,
  useModalStoreMock,
  usePreviewSessionStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  collectDocumentPathsUnderMock: vi.fn(),
  getConfigMock: vi.fn(),
  getDirtyBufferContentMock: vi.fn(),
  getByLabelMock: vi.fn(),
  hasUnsavedDocumentsUnderMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  modalOpenMock: vi.fn(),
  routerPushMock: vi.fn(),
  saveFileMock: vi.fn(),
  toastErrorMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  usePreviewSessionStoreMock: vi.fn(),
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

vi.mock('~/stores/editor', () => ({
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/stores/preview-session', () => ({
  usePreviewSessionStore: usePreviewSessionStoreMock,
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
    collectDocumentPathsUnderMock.mockReset()
    getConfigMock.mockReset()
    getDirtyBufferContentMock.mockReset()
    getByLabelMock.mockReset()
    hasUnsavedDocumentsUnderMock.mockReset()
    loggerErrorMock.mockReset()
    modalOpenMock.mockReset()
    routerPushMock.mockReset()
    saveFileMock.mockReset()
    toastErrorMock.mockReset()
    useEditorStoreMock.mockReset()
    useModalStoreMock.mockReset()
    usePreviewSessionStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    collectDocumentPathsUnderMock.mockReturnValue([])
    hasUnsavedDocumentsUnderMock.mockReturnValue(false)
    useEditorStoreMock.mockReturnValue({
      collectDocumentPathsUnder: collectDocumentPathsUnderMock,
      getDirtyBufferContent: getDirtyBufferContentMock,
      hasUnsavedDocumentsUnder: hasUnsavedDocumentsUnderMock,
      saveFile: saveFileMock,
    })
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
    }))
    usePreviewSessionStoreMock.mockReturnValue(reactive({
      currentGameServeUrl: 'http://127.0.0.1:8899/game/test/',
    }))
    getConfigMock.mockResolvedValue({
      entries: [
        { key: 'Default_Language', value: 'zh_CN' },
        { key: 'Description', value: 'Intro' },
        { key: 'Enable_Appreciation', value: 'false' },
        { key: 'Game_key', value: 'demo-key' },
        { key: 'Game_name', value: '测试游戏' },
        { key: 'Title_img', value: 'cover.webp' },
        { key: 'Legacy_Expression_Blend_Mode', value: 'false' },
        { key: 'Line_height', value: '2.2' },
        { key: 'Max_line', value: '3' },
        { key: 'Package_name', value: 'org.demo.game' },
        { key: 'Game_Logo', value: 'opening.webp|enter.webp|' },
        { key: 'Show_panic', value: 'true' },
        { key: 'Steam_AppID', value: '480' },
        { key: 'Title_bgm', value: 'title.ogg' },
        { key: 'Stage_Width', value: '1920' },
        {
          key: 'Custom_flag',
          value: 'enabled',
        },
      ],
      unmanagedLineCount: 1,
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
    }))
    usePreviewSessionStoreMock.mockReturnValue(reactive({
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

  it('返回主页前无未保存更改时直接跳转', async () => {
    renderInBrowser(EditHeader, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'common.back' }).click()

    await vi.waitFor(() => {
      expect(hasUnsavedDocumentsUnderMock).toHaveBeenCalledWith('/games/test')
      expect(routerPushMock).toHaveBeenCalledWith('/')
    })
    expect(modalOpenMock).not.toHaveBeenCalledWith('SaveChangesModal', expect.anything())
  })

  it('返回主页前有未保存更改时会打开确认弹窗', async () => {
    hasUnsavedDocumentsUnderMock.mockReturnValue(true)

    renderInBrowser(EditHeader, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'common.back' }).click()

    await vi.waitFor(() => {
      expect(modalOpenMock).toHaveBeenCalledWith('SaveChangesModal', expect.objectContaining({
        title: 'edit.leaveConfirm.title',
      }))
    })
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('确认保存后会先保存所有脏文档再返回主页', async () => {
    hasUnsavedDocumentsUnderMock.mockReturnValue(true)
    collectDocumentPathsUnderMock.mockReturnValue(['/games/test/scene/a.txt', '/games/test/scene/b.txt', '/games/test/assets/c.png'])
    getDirtyBufferContentMock.mockImplementation((path: string) => {
      switch (path) {
        case '/games/test/scene/a.txt': {
          return 'dirty-a'
        }
        case '/games/test/scene/b.txt': {
          return
        }
        case '/games/test/assets/c.png': {
          return 'dirty-c'
        }
        default: {
          return
        }
      }
    })

    renderInBrowser(EditHeader, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'common.back' }).click()

    await vi.waitFor(() => {
      expect(modalOpenMock.mock.calls.some(([name]) => name === 'SaveChangesModal')).toBe(true)
    })

    const saveChangesCall = modalOpenMock.mock.calls.find(([name]) => name === 'SaveChangesModal')
    if (!saveChangesCall) {
      throw new Error('expected SaveChangesModal to be opened')
    }

    const [, modalOptions] = saveChangesCall as [string, { onSave?: () => Promise<void> }]

    await modalOptions.onSave?.()

    expect(saveFileMock).toHaveBeenCalledTimes(2)
    expect(saveFileMock).toHaveBeenNthCalledWith(1, '/games/test/scene/a.txt')
    expect(saveFileMock).toHaveBeenNthCalledWith(2, '/games/test/assets/c.png')
    expect(routerPushMock).toHaveBeenCalledWith('/')
  })
  it('确认不保存时会直接返回主页且不会触发保存', async () => {
    hasUnsavedDocumentsUnderMock.mockReturnValue(true)

    renderInBrowser(EditHeader, {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'common.back' }).click()

    const saveChangesCall = modalOpenMock.mock.calls.find(([name]) => name === 'SaveChangesModal')
    expect(saveChangesCall).toBeDefined()
    const modalOptions = saveChangesCall?.[1] as { onDontSave?: () => Promise<void> }

    await modalOptions.onDontSave?.()

    expect(saveFileMock).not.toHaveBeenCalled()
    expect(routerPushMock).toHaveBeenCalledWith('/')
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
          customConfig: [
            {
              key: 'Stage_Width',
              value: '1920',
            },
            {
              key: 'Custom_flag',
              value: 'enabled',
            },
          ],
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
        unmanagedLineCount: 1,
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
