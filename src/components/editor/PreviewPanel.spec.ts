import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { nextTick, reactive, ref } from 'vue'

import { createBrowserLiteI18n } from '~/__tests__/browser'
import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import {
  WEBGAL_PREVIEW_BOOTSTRAP_PROVIDE,
  WEBGAL_PREVIEW_BOOTSTRAP_REQUEST,
  WEBGAL_PREVIEW_VIEWPORT_POINTER,
  WEBGAL_PREVIEW_VIEWPORT_SPACE_KEY,
  WEBGAL_PREVIEW_VIEWPORT_WHEEL,
} from '~/features/editor/preview/embedded-preview-messages'
import { useShortcutContextRegistry } from '~/features/editor/shortcut/shortcut-context-registry'
import { TRANSFORM_OVERLAY_BRIDGE_KEY } from '~/features/editor/transform-overlay/context'

const {
  copyMock,
  getGameConfigMock,
  modalOpenMock,
  toastSuccessMock,
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
  useSceneEntryStatusMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  copyMock: vi.fn(),
  getGameConfigMock: vi.fn(),
  modalOpenMock: vi.fn(),
  toastSuccessMock: vi.fn(),
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
  useSceneEntryStatusMock: vi.fn(),
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

vi.mock('~/features/editor/scene-entry/useSceneEntryStatus', () => ({
  useSceneEntryStatus: useSceneEntryStatusMock,
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

vi.mock('vue-sonner', () => ({
  toast: {
    success: toastSuccessMock,
  },
}))

import PreviewPanel from './PreviewPanel.vue'

import type { DisplayTransform } from '~/features/editor/transform-overlay/model'
import type { useTransformOverlayBridge } from '~/features/editor/transform-overlay/useTransformOverlayBridge'
import type { ReferenceBox } from '~/types/editorPreviewProtocol'

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

let sceneEntryStatusState: {
  status: ReturnType<typeof ref<'checking' | 'valid' | 'missing'>>
}

const transformOverlayReferenceBox: ReferenceBox = {
  originX: 640,
  originY: 360,
  width: 200,
  height: 100,
  anchorX: 0.5,
  anchorY: 0.5,
  stageWidth: 1280,
  stageHeight: 720,
}
const transformOverlayDisplayTransform: DisplayTransform = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
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

function createTransformOverlayBridge(): ReturnType<typeof useTransformOverlayBridge> {
  return {
    displayTransform: ref(transformOverlayDisplayTransform),
    enabled: ref(true),
    formDisplayTransform: ref(transformOverlayDisplayTransform),
    referenceBox: ref(transformOverlayReferenceBox),
    cancelDisplayTransform: vi.fn(),
    handlePanelTransformUpdate: vi.fn(),
    updateDisplayTransform: vi.fn(),
  } as unknown as ReturnType<typeof useTransformOverlayBridge>
}

function parsePreviewTransform(transform: string): {
  panX: number
  panY: number
  zoom: number
} {
  const match = /^translate\((-?\d+(?:\.\d+)?)px, (-?\d+(?:\.\d+)?)px\) scale\((-?\d+(?:\.\d+)?)\)$/.exec(transform)
  if (!match) {
    throw new Error(`无法解析预览变换: ${transform}`)
  }

  const [, panX, panY, zoom] = match

  return {
    panX: Number(panX),
    panY: Number(panY),
    zoom: Number(zoom),
  }
}

function expectCloseToCssNumber(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(0.01)
}

function getPreviewIframe(): {
  iframe: HTMLIFrameElement
  iframeWindow: Window
} {
  const iframe = document.querySelector<HTMLIFrameElement>('iframe')
  const iframeWindow = iframe?.contentWindow

  if (!iframe || !iframeWindow) {
    throw new Error('预览 iframe 应已渲染')
  }

  return {
    iframe,
    iframeWindow,
  }
}

function dispatchPreviewSpaceKeyMessage(iframeWindow: Window, pressed: boolean): void {
  globalThis.dispatchEvent(new MessageEvent('message', {
    data: {
      type: WEBGAL_PREVIEW_VIEWPORT_SPACE_KEY,
      pressed,
    },
    origin: 'http://127.0.0.1:8899',
    source: iframeWindow,
  }))
}

function dispatchPreviewWheelMessage(
  iframeWindow: Window,
  data: {
    clientX: number
    clientY: number
    ctrlKey: boolean
    deltaY: number
    metaKey: boolean
  },
): void {
  globalThis.dispatchEvent(new MessageEvent('message', {
    data: {
      type: WEBGAL_PREVIEW_VIEWPORT_WHEEL,
      ...data,
    },
    origin: 'http://127.0.0.1:8899',
    source: iframeWindow,
  }))
}

function dispatchPreviewPointerMessage(
  iframeWindow: Window,
  data: {
    button: number
    buttons: number
    clientX: number
    clientY: number
    eventType: 'pointercancel' | 'pointerdown' | 'pointermove' | 'pointerup'
    pointerId: number
  },
): void {
  globalThis.dispatchEvent(new MessageEvent('message', {
    data: {
      type: WEBGAL_PREVIEW_VIEWPORT_POINTER,
      ...data,
    },
    origin: 'http://127.0.0.1:8899',
    source: iframeWindow,
  }))
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
    toastSuccessMock.mockReset()
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
    useSceneEntryStatusMock.mockReset()
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
      refresh: () => {
        previewSessionStoreState.reloadVersion++
      },
    })
    usePreviewSessionStoreMock.mockReturnValue(previewSessionStoreState)
    sceneEntryStatusState = {
      status: ref('valid'),
    }
    useSceneEntryStatusMock.mockReturnValue(sceneEntryStatusState)
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
    await expect.element(page.getByText('1280 x 720')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'edit.previewPanel.fitToView' })).toBeVisible()
    expect(getGameConfigMock).toHaveBeenCalledWith('/games/demo')
    expect(resetEmbeddedPreviewStateMock).toHaveBeenCalledTimes(1)
    expect(setEmbeddedPreviewLaunchIdMock).toHaveBeenCalledWith(expect.any(String))
  })

  it('缺少规范入口时只显示错误遮罩，入口恢复后重新挂载预览', async () => {
    sceneEntryStatusState.status.value = 'missing'

    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('preview-missing-entry-overlay')).toHaveRole('alert')
    expect(document.querySelector('iframe')).toBeNull()
    await expect.element(page.getByTestId('preview-bottom-toolbar')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'edit.previewPanel.zoomOut' })).toBeDisabled()
    await expect.element(page.getByRole('button', { name: 'edit.previewPanel.zoomIn' })).toBeDisabled()
    await expect.element(page.getByRole('button', { name: 'edit.previewPanel.fitToView' })).toBeDisabled()
    await expect.element(page.getByRole('button', { name: 'edit.previewPanel.refreshPreview' })).toBeDisabled()
    await expect.element(page.getByRole('button', { name: 'edit.previewPanel.copyUrl' })).toBeDisabled()
    await expect.element(page.getByRole('button', { name: 'edit.previewPanel.openInBrowser' })).toBeDisabled()

    sceneEntryStatusState.status.value = 'valid'
    await nextTick()

    await expect.element(page.getByTitle('preview-title::Demo Game')).toBeVisible()
    expect(previewSessionStoreState.reloadVersion).toBeGreaterThan(0)
  })

  it('入口校验期间不显示缺失遮罩，校验通过后挂载预览', async () => {
    sceneEntryStatusState.status.value = 'checking'

    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    expect(document.querySelector('[data-testid="preview-missing-entry-overlay"]')).toBeNull()
    expect(document.querySelector('iframe')).toBeNull()

    sceneEntryStatusState.status.value = 'valid'
    await expect.element(page.getByTitle('preview-title::Demo Game')).toBeVisible()
    expect(previewSessionStoreState.reloadVersion).toBeGreaterThan(0)
  })

  it('收到同源 iframe 转发的空格按键消息时会让 iframe 上的拖拽交给外层视口平移', async () => {
    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    await vi.waitFor(() => {
      expect(getGameConfigMock).toHaveBeenCalledTimes(1)
    })

    const { iframe, iframeWindow } = getPreviewIframe()

    expect(iframe.style.pointerEvents).toBe('')
    expect(document.querySelector('[data-testid="preview-interaction-overlay"]')).toBeNull()

    dispatchPreviewSpaceKeyMessage(iframeWindow, true)
    await nextTick()

    expect(iframe.style.pointerEvents).toBe('none')
    const overlay = document.querySelector<HTMLElement>('[data-testid="preview-interaction-overlay"]')
    expect(overlay).not.toBeNull()
    expect(getComputedStyle(overlay as HTMLElement).cursor).toBe('grab')
  })

  it('iframe 内松开空格后会立即用 auto 光标重置覆盖层', async () => {
    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    await vi.waitFor(() => {
      expect(getGameConfigMock).toHaveBeenCalledTimes(1)
    })

    const { iframe, iframeWindow } = getPreviewIframe()

    dispatchPreviewSpaceKeyMessage(iframeWindow, true)
    await nextTick()

    dispatchPreviewSpaceKeyMessage(iframeWindow, false)
    await nextTick()

    const resetOverlay = document.querySelector<HTMLElement>('[data-testid="preview-interaction-overlay"]')
    expect(resetOverlay).not.toBeNull()
    expect(iframe.style.pointerEvents).toBe('none')
    expect(getComputedStyle(resetOverlay as HTMLElement).cursor).toBe('auto')

    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    expect(document.querySelector('[data-testid="preview-interaction-overlay"]')).toBeNull()
    expect(iframe.style.pointerEvents).toBe('')
  })

  it('按下 Ctrl 不会进入抓手交互态', async () => {
    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    await vi.waitFor(() => {
      expect(getGameConfigMock).toHaveBeenCalledTimes(1)
    })

    const { iframe } = getPreviewIframe()

    globalThis.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'ControlLeft',
      ctrlKey: true,
    }))
    await nextTick()

    expect(iframe.style.pointerEvents).toBe('')
    expect(document.querySelector('[data-testid="preview-interaction-overlay"]')).toBeNull()
  })

  it('收到同源 iframe 转发的 Cmd 或 Ctrl 滚轮消息时会缩放视口', async () => {
    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    await vi.waitFor(() => {
      expect(getGameConfigMock).toHaveBeenCalledTimes(1)
    })

    const canvas = document.querySelector<HTMLElement>('[data-testid="preview-canvas"]')
    const { iframeWindow } = getPreviewIframe()
    expect(canvas).not.toBeNull()

    await vi.waitFor(() => {
      expect(parsePreviewTransform(canvas?.style.transform ?? '').zoom).not.toBe(1)
    })

    const initialTransform = parsePreviewTransform(canvas?.style.transform ?? '')

    dispatchPreviewWheelMessage(iframeWindow, {
      clientX: 120,
      clientY: 64,
      ctrlKey: true,
      deltaY: -1,
      metaKey: false,
    })
    await nextTick()

    const nextTransform = parsePreviewTransform(canvas?.style.transform ?? '')
    const expectedZoom = initialTransform.zoom * 1.1

    expectCloseToCssNumber(nextTransform.zoom, expectedZoom)
    expectCloseToCssNumber(nextTransform.panX, initialTransform.panX - (120 * (expectedZoom - initialTransform.zoom)))
    expectCloseToCssNumber(nextTransform.panY, initialTransform.panY - (64 * (expectedZoom - initialTransform.zoom)))
  })

  it('收到同源 iframe 转发的中键指针消息时会平移视口', async () => {
    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        stubs: globalStubs,
      },
    })

    await vi.waitFor(() => {
      expect(getGameConfigMock).toHaveBeenCalledTimes(1)
    })

    const canvas = document.querySelector<HTMLElement>('[data-testid="preview-canvas"]')
    const { iframe, iframeWindow } = getPreviewIframe()
    expect(canvas).not.toBeNull()

    await vi.waitFor(() => {
      expect(parsePreviewTransform(canvas?.style.transform ?? '').zoom).not.toBe(1)
    })

    const initialTransform = parsePreviewTransform(canvas?.style.transform ?? '')

    dispatchPreviewPointerMessage(iframeWindow, {
      button: 1,
      buttons: 4,
      clientX: 100,
      clientY: 120,
      eventType: 'pointerdown',
      pointerId: 7,
    })
    await nextTick()

    expect(iframe.style.pointerEvents).toBe('none')
    expect(getComputedStyle(document.querySelector<HTMLElement>('[data-testid="preview-interaction-overlay"]') as HTMLElement).cursor).toBe('grabbing')

    dispatchPreviewPointerMessage(iframeWindow, {
      button: -1,
      buttons: 4,
      clientX: 140,
      clientY: 180,
      eventType: 'pointermove',
      pointerId: 7,
    })
    await nextTick()

    const nextTransform = parsePreviewTransform(canvas?.style.transform ?? '')

    expectCloseToCssNumber(nextTransform.panX, initialTransform.panX + (40 * initialTransform.zoom))
    expectCloseToCssNumber(nextTransform.panY, initialTransform.panY + (60 * initialTransform.zoom))

    dispatchPreviewPointerMessage(iframeWindow, {
      button: 1,
      buttons: 0,
      clientX: 140,
      clientY: 180,
      eventType: 'pointerup',
      pointerId: 7,
    })
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    expect(document.querySelector('[data-testid="preview-interaction-overlay"]')).toBeNull()
    expect(iframe.style.pointerEvents).toBe('')
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
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(openUrlMock).toHaveBeenCalledWith('http://127.0.0.1:8899')
  })

  it('变换浮层开启时点击预览空白区域和底部工具栏会保持浮层快捷键上下文', async () => {
    renderInBrowser(PreviewPanel, {
      global: {
        plugins: [createPreviewPanelLiteI18n()],
        provide: {
          [TRANSFORM_OVERLAY_BRIDGE_KEY as symbol]: createTransformOverlayBridge(),
        },
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('transform-overlay')).toBeVisible()

    const externalInput = document.createElement('input')
    document.body.append(externalInput)

    try {
      externalInput.focus()

      document.querySelector<HTMLElement>('[data-testid="transform-overlay"]')?.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
      }))
      await nextTick()

      expect(useShortcutContextRegistry().resolveContext().panelFocus).toBe('transformOverlay')

      externalInput.focus()

      await page.getByRole('button', { name: 'edit.previewPanel.zoomOut' }).click()

      expect(useShortcutContextRegistry().resolveContext().panelFocus).toBe('transformOverlay')
    } finally {
      externalInput.remove()
    }
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
      origin: 'https://example.invalid',
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
      { force: true },
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
