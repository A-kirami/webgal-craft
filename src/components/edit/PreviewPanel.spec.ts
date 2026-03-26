import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { reactive, ref } from 'vue'

import { createBrowserLiteI18n } from '~/__tests__/browser'
import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

const {
  copyMock,
  getGameConfigMock,
  notifySuccessMock,
  openUrlMock,
  useClipboardMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  copyMock: vi.fn(),
  getGameConfigMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  openUrlMock: vi.fn(),
  useClipboardMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: openUrlMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')

  return {
    ...actual,
    useClipboard: useClipboardMock,
  }
})

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('~/commands/game', () => ({
  gameCmds: {
    getGameConfig: getGameConfigMock,
  },
}))

vi.mock('notivue', () => ({
  push: {
    success: notifySuccessMock,
  },
}))

import PreviewPanel from './PreviewPanel.vue'

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipProvider: createBrowserContainerStub('StubTooltipProvider'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
}

function createPreviewPanelLiteI18n() {
  return createBrowserLiteI18n({
    messages: {
      'zh-Hans': {
        edit: {
          previewPanel: {
            previewTitle: 'preview-title::{name}',
          },
        },
      },
    },
  })
}

describe('PreviewPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    copyMock.mockReset()
    getGameConfigMock.mockReset()
    notifySuccessMock.mockReset()
    openUrlMock.mockReset()
    useClipboardMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        metadata: {
          name: 'Demo Game',
        },
        path: '/games/demo',
      },
      currentGameServeUrl: 'http://127.0.0.1:8899',
    }))
    useClipboardMock.mockReturnValue({
      copied: ref(true),
      copy: copyMock,
    })
    getGameConfigMock.mockResolvedValue({
      stageHeight: 720,
      stageWidth: 1280,
    })
  })

  it('挂载时会读取预览宽高比并渲染 iframe', async () => {
    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('http://127.0.0.1:8899')).toBeVisible()
    await expect.element(page.getByTitle('preview-title::Demo Game')).toHaveAttribute('src', 'http://127.0.0.1:8899')
    expect(getGameConfigMock).toHaveBeenCalledWith('/games/demo')
  })

  it('点击复制和浏览器打开按钮会调用对应动作', async () => {
    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'edit.previewPanel.copyUrl' }).click()
    await page.getByRole('button', { name: 'edit.previewPanel.openInBrowser' }).click()

    expect(copyMock).toHaveBeenCalledTimes(1)
    expect(notifySuccessMock).toHaveBeenCalledWith('edit.previewPanel.copyUrlSuccess')
    expect(openUrlMock).toHaveBeenCalledWith('http://127.0.0.1:8899')
  })

  it('点击刷新按钮会重新读取游戏配置', async () => {
    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'edit.previewPanel.refreshPreview' }).click()

    expect(getGameConfigMock).toHaveBeenCalledTimes(2)
  })
})
