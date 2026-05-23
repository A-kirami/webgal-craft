import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { nextTick, reactive, ref } from 'vue'

import { createBrowserLiteI18n } from '~/__tests__/browser'
import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import {
  WEBGAL_PREVIEW_BOOTSTRAP_PROVIDE,
  WEBGAL_PREVIEW_BOOTSTRAP_REQUEST,
} from '~/features/editor/preview/embedded-preview-bootstrap'

const {
  copyMock,
  getGameConfigMock,
  modalOpenMock,
  notifySuccessMock,
  openUrlMock,
  dismissFastPreviewTimeoutMock,
  resetEmbeddedPreviewStateMock,
  setEmbeddedPreviewLaunchIdMock,
  syncSceneMock,
  useClipboardMock,
  useEditorStoreMock,
  useModalStoreMock,
  usePreviewRuntimeStoreMock,
  usePreviewSessionStoreMock,
  usePreviewSyncStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  copyMock: vi.fn(),
  getGameConfigMock: vi.fn(),
  modalOpenMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  openUrlMock: vi.fn(),
  dismissFastPreviewTimeoutMock: vi.fn(),
  resetEmbeddedPreviewStateMock: vi.fn(),
  setEmbeddedPreviewLaunchIdMock: vi.fn(),
  syncSceneMock: vi.fn(),
  useClipboardMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  usePreviewRuntimeStoreMock: vi.fn(),
  usePreviewSessionStoreMock: vi.fn(),
  usePreviewSyncStoreMock: vi.fn(),
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

vi.mock('~/stores/editor', () => ({
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/stores/preview-runtime', () => ({
  usePreviewRuntimeStore: usePreviewRuntimeStoreMock,
}))

vi.mock('~/stores/preview-session', () => ({
  usePreviewSessionStore: usePreviewSessionStoreMock,
}))

vi.mock('~/stores/preview-sync', () => ({
  usePreviewSyncStore: usePreviewSyncStoreMock,
}))

vi.mock('~/commands/game', async () => {
  const actual = await vi.importActual<typeof import('~/commands/game')>('~/commands/game')

  return {
    ...actual,
    gameCmds: {
      ...actual.gameCmds,
      getGameConfig: getGameConfigMock,
    },
  }
})

vi.mock('~/services/debug-commander', () => ({
  debugCommander: {
    syncScene: syncSceneMock,
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

let workspaceStoreState: {
  currentGame: {
    lastModified: number
    metadata: {
      name: string
    }
    path: string
  }
}

let previewSessionStoreState: {
  currentGameServeUrl: string
  reloadVersion: number
  refresh: () => void
}

async function flushPreviewWatchers() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve
  })

  return {
    promise,
    resolve,
  }
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
    dismissFastPreviewTimeoutMock.mockReset()
    getGameConfigMock.mockReset()
    modalOpenMock.mockReset()
    notifySuccessMock.mockReset()
    openUrlMock.mockReset()
    resetEmbeddedPreviewStateMock.mockReset()
    setEmbeddedPreviewLaunchIdMock.mockReset()
    syncSceneMock.mockReset()
    useClipboardMock.mockReset()
    useEditorStoreMock.mockReset()
    useModalStoreMock.mockReset()
    usePreviewRuntimeStoreMock.mockReset()
    usePreviewSessionStoreMock.mockReset()
    usePreviewSyncStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    workspaceStoreState = reactive({
      currentGame: {
        lastModified: 100,
        metadata: {
          name: 'Demo Game',
        },
        path: '/games/demo',
      },
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

    previewSessionStoreState = reactive({
      currentGameServeUrl: 'http://127.0.0.1:8899',
      reloadVersion: 0,
      refresh() {
        this.reloadVersion++
      },
    })
    usePreviewSessionStoreMock.mockReturnValue(previewSessionStoreState)
    useClipboardMock.mockReturnValue({
      copied: ref(true),
      copy: copyMock,
    })
    useEditorStoreMock.mockReturnValue(reactive({
      currentSceneSelection: {
        lastLineNumber: 2,
      },
      currentState: {
        kind: 'scene',
        path: '/games/demo/scene/start.txt',
      },
      currentTextProjection: {
        textContent: 'first line\nsecond line',
      },
    }))
    usePreviewRuntimeStoreMock.mockReturnValue({
      setEmbeddedPreviewLaunchId: setEmbeddedPreviewLaunchIdMock,
    })
    useModalStoreMock.mockReturnValue({
      open: modalOpenMock,
    })
    usePreviewSyncStoreMock.mockReturnValue(reactive({
      fastPreviewTimeout: undefined,
      isPreviewReady: false,
      dismissFastPreviewTimeout: dismissFastPreviewTimeoutMock,
      resetEmbeddedPreviewState: resetEmbeddedPreviewStateMock,
    }))
    getGameConfigMock.mockResolvedValue({
      entries: [
        { key: 'Stage_Height', value: '720' },
        { key: 'Stage_Width', value: '1280' },
      ],
      unmanagedLineCount: 0,
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
    expect(resetEmbeddedPreviewStateMock).toHaveBeenCalledTimes(1)
    expect(setEmbeddedPreviewLaunchIdMock).toHaveBeenCalledWith(expect.any(String))
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

  it('点击刷新按钮会重新读取游戏配置并刷新内嵌预览槽位', async () => {
    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'edit.previewPanel.refreshPreview' }).click()

    expect(getGameConfigMock).toHaveBeenCalledTimes(2)
    expect(setEmbeddedPreviewLaunchIdMock).toHaveBeenCalledTimes(2)
    expect(resetEmbeddedPreviewStateMock).toHaveBeenCalledTimes(2)
  })

  it('会串行更新宿主端内嵌预览槽位，避免旧槽位异步晚到覆盖新槽位', async () => {
    const pendingUpdates: {
      embeddedLaunchId?: string
      update: ReturnType<typeof createDeferred>
    }[] = []
    let hostEmbeddedLaunchId: string | undefined
    setEmbeddedPreviewLaunchIdMock.mockImplementation((embeddedLaunchId?: string) => {
      const update = createDeferred()
      pendingUpdates.push({ embeddedLaunchId, update })

      return update.promise.then(() => {
        hostEmbeddedLaunchId = embeddedLaunchId
      })
    })

    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    await vi.waitFor(() => {
      expect(setEmbeddedPreviewLaunchIdMock).toHaveBeenCalledTimes(1)
    })

    await page.getByRole('button', { name: 'edit.previewPanel.refreshPreview' }).click()

    await vi.waitFor(() => {
      expect(resetEmbeddedPreviewStateMock).toHaveBeenCalledTimes(2)
    })
    expect(setEmbeddedPreviewLaunchIdMock).toHaveBeenCalledTimes(1)

    pendingUpdates[0]?.update.resolve()
    await vi.waitFor(() => {
      expect(setEmbeddedPreviewLaunchIdMock).toHaveBeenCalledTimes(2)
    })

    const latestEmbeddedLaunchId = pendingUpdates[1]?.embeddedLaunchId
    pendingUpdates[1]?.update.resolve()

    await vi.waitFor(() => {
      expect(hostEmbeddedLaunchId).toBe(latestEmbeddedLaunchId)
    })
  })

  it('只向预览地址同源的内嵌预览回传启动信息', async () => {
    const sameOriginPreviewUrl = new URL('/__webgal_preview_bootstrap_test__', globalThis.location.href)
    previewSessionStoreState.currentGameServeUrl = sameOriginPreviewUrl.href

    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    await vi.waitFor(() => {
      expect(setEmbeddedPreviewLaunchIdMock).toHaveBeenCalledWith(expect.any(String))
    })

    const embeddedLaunchId = setEmbeddedPreviewLaunchIdMock.mock.calls[0]?.[0]
    const iframeWindow = document.querySelector<HTMLIFrameElement>('iframe')?.contentWindow
    expect(iframeWindow).not.toBeNull()

    const postMessageSpy = vi.spyOn(iframeWindow as Window, 'postMessage').mockImplementation(() => undefined)
    const requestMessage = {
      type: WEBGAL_PREVIEW_BOOTSTRAP_REQUEST,
    }

    globalThis.dispatchEvent(new MessageEvent('message', {
      data: requestMessage,
      origin: 'http://example.invalid',
      source: iframeWindow,
    }))
    expect(postMessageSpy).not.toHaveBeenCalled()

    globalThis.dispatchEvent(new MessageEvent('message', {
      data: requestMessage,
      origin: sameOriginPreviewUrl.origin,
      source: iframeWindow,
    }))

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        type: WEBGAL_PREVIEW_BOOTSTRAP_PROVIDE,
        embeddedLaunchId,
      },
      sameOriginPreviewUrl.origin,
    )
  })

  it('预览就绪事件触发后会按当前场景行初始化预览', async () => {
    const previewSyncStore = reactive({
      fastPreviewTimeout: undefined,
      isPreviewReady: false,
      dismissFastPreviewTimeout: dismissFastPreviewTimeoutMock,
      resetEmbeddedPreviewState: resetEmbeddedPreviewStateMock,
    })
    usePreviewSyncStoreMock.mockReturnValue(previewSyncStore)

    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    previewSyncStore.isPreviewReady = true
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(syncSceneMock).toHaveBeenCalledWith(
      '/games/demo/scene/start.txt',
      2,
      'second line',
      true,
    )
  })

  it('当前游戏快照更新时间变化时不会自动重新读取游戏配置', async () => {
    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    await vi.waitFor(() => {
      expect(getGameConfigMock).toHaveBeenCalledTimes(1)
    })

    workspaceStoreState.currentGame.lastModified += 1
    await flushPreviewWatchers()

    expect(getGameConfigMock).toHaveBeenCalledTimes(1)
  })

  it('预览 reloadVersion 变化时会自动重新读取游戏配置', async () => {
    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    await vi.waitFor(() => {
      expect(getGameConfigMock).toHaveBeenCalledTimes(1)
    })

    previewSessionStoreState.refresh()

    await vi.waitFor(() => {
      expect(getGameConfigMock).toHaveBeenCalledTimes(2)
    })
  })

  it('收到快速预览超时事件后会通过全局 modal store 打开警告弹窗', async () => {
    const previewSyncStore = reactive({
      fastPreviewTimeout: undefined as {
        sceneName: string
        sentenceId: number
        targetSentenceId: number
        forwardedLineCount: number
        elapsedMs: number
        maxDurationMs: number
      } | undefined,
      isPreviewReady: false,
      dismissFastPreviewTimeout: dismissFastPreviewTimeoutMock,
      resetEmbeddedPreviewState: resetEmbeddedPreviewStateMock,
    })
    usePreviewSyncStoreMock.mockReturnValue(previewSyncStore)

    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    previewSyncStore.fastPreviewTimeout = {
      sceneName: 'scene/start.txt',
      sentenceId: 8,
      targetSentenceId: 12,
      forwardedLineCount: 24,
      elapsedMs: 151,
      maxDurationMs: 150,
    }
    await nextTick()

    await vi.waitFor(() => {
      expect(modalOpenMock).toHaveBeenCalledWith(
        'FastPreviewTimeoutModal',
        expect.objectContaining({
          payload: {
            sceneName: 'scene/start.txt',
            sentenceId: 8,
            targetSentenceId: 12,
            forwardedLineCount: 24,
            elapsedMs: 151,
            maxDurationMs: 150,
          },
          onClose: dismissFastPreviewTimeoutMock,
        }),
      )
    })

    const props = modalOpenMock.mock.calls[0][1]
    props.onClose()

    expect(dismissFastPreviewTimeoutMock).toHaveBeenCalledTimes(1)
  })
})
