<script setup lang="ts">
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { openUrl } from '@tauri-apps/plugin-opener'

import { findGameConfigEntryValue, gameCmds } from '~/commands/game'
import { usePreviewViewport } from '~/composables/usePreviewViewport'
import {
  createPreviewBootstrapProvideMessage,
  createPreviewOutputSettingsMessage,
  createPreviewViewportSpaceKeyMessage,
  isPreviewBootstrapRequestMessage,
  isPreviewViewportPointerMessage,
  isPreviewViewportSpaceKeyMessage,
  isPreviewViewportWheelMessage,
} from '~/features/editor/preview/embedded-preview-messages'
import { applyPreviewFullscreenAction, previewFullscreenTransition } from '~/features/editor/preview/preview-fullscreen'
import {
  DEFAULT_PREVIEW_PANEL_ASPECT_RATIO,
  DEFAULT_PREVIEW_PANEL_STAGE_HEIGHT,
  DEFAULT_PREVIEW_PANEL_STAGE_WIDTH,
  resolvePreviewPanelStageSize,
} from '~/features/editor/preview/preview-panel'
import { resolvePreviewReadySyncTarget } from '~/features/editor/preview/preview-ready-sync-target'
import { useSceneEntryStatus } from '~/features/editor/scene-entry/useSceneEntryStatus'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { TRANSFORM_OVERLAY_BRIDGE_KEY } from '~/features/editor/transform-overlay/context'
import { debugCommander } from '~/services/debug-commander'
import { useEditorStore } from '~/stores/editor'
import { useModalStore } from '~/stores/modal'
import { usePreferenceStore } from '~/stores/preference'
import { usePreviewRuntimeStore } from '~/stores/preview-runtime'
import { usePreviewSessionStore } from '~/stores/preview-session'
import { usePreviewSyncStore } from '~/stores/preview-sync'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'

import PreviewToolbar from './PreviewToolbar.vue'
import TransformOverlay from './TransformOverlay.vue'
import ViewportControls from './ViewportControls.vue'

import type { UnlistenFn } from '@tauri-apps/api/event'
import type { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { PreviewFullscreenStatus, PreviewFullscreenWindow } from '~/features/editor/preview/preview-fullscreen'
import type { PreviewPanelStageSize } from '~/features/editor/preview/preview-panel'
import type { DisplayTransform } from '~/features/editor/transform-overlay/model'
import type { PreviewConnectionStatus } from '~/stores/preview-sync'

const editorStore = useEditorStore()
const modalStore = useModalStore()
const preferenceStore = usePreferenceStore()
const previewRuntimeStore = usePreviewRuntimeStore()
const previewSessionStore = usePreviewSessionStore()
const previewSyncStore = usePreviewSyncStore()
const workspaceStore = useWorkspaceStore()
const sceneEntryStatus = useSceneEntryStatus()
const iframeRef = useTemplateRef<HTMLIFrameElement>('iframeRef')
const previewWorkspaceRef = useTemplateRef<HTMLElement>('previewWorkspace')
const viewportRef = useTemplateRef<HTMLElement>('viewportRef')
const transformOverlayBridge = inject(TRANSFORM_OVERLAY_BRIDGE_KEY, undefined)
const transformOverlayEnabled = $computed(() => transformOverlayBridge?.enabled.value ?? false)
const transformOverlayReferenceBox = $computed(() => transformOverlayBridge?.referenceBox.value)
const transformOverlayDisplayTransform = $computed(() => transformOverlayBridge?.displayTransform.value)

const previewUrl = $computed(() => previewSessionStore.currentGameServeUrl ?? '')
const hasPreviewUrl = $computed(() => !!previewSessionStore.currentGameServeUrl)
const hasValidEntryPoint = $computed(() => sceneEntryStatus.status.value === 'valid')
const hasMissingEntryPoint = $computed(() => sceneEntryStatus.status.value === 'missing')
const canPreview = $computed(() => hasPreviewUrl && hasValidEntryPoint)
const previewConnectionStatus = $computed((): PreviewConnectionStatus | undefined => {
  // 入口不可用时预览端不会启动，连接状态没有可展示的语义，交由缺少入口遮罩说明
  if (!hasValidEntryPoint) {
    return undefined
  }
  if (previewSessionStore.serveStatus === 'failed') {
    return 'failed'
  }
  if (previewSessionStore.serveStatus !== 'ready') {
    return 'connecting'
  }

  return previewSyncStore.connectionStatus
})

const { t } = useI18n()
const previewTitle = $computed(() => t('edit.previewPanel.previewTitle', { name: workspaceStore.currentGame?.metadata.name }))
const resolutionLabel = $computed(() => `${stageWidth} x ${stageHeight}`)

const PREVIEW_WORKSPACE_FOCUSABLE_SELECTOR = 'a[href], button, input, textarea, select, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
// 悬浮工具栏内的读数与容器不是可聚焦控件，无法由聚焦选择器识别
const PREVIEW_VIEWPORT_CHROME_SELECTOR = '[data-preview-viewport-chrome]'
const PREVIEW_VIEWPORT_TARGET_SELECTOR = `${PREVIEW_WORKSPACE_FOCUSABLE_SELECTOR}, ${PREVIEW_VIEWPORT_CHROME_SELECTOR}`

let aspectRatio = $ref(DEFAULT_PREVIEW_PANEL_ASPECT_RATIO)
let stageWidth = $ref(DEFAULT_PREVIEW_PANEL_STAGE_WIDTH)
let stageHeight = $ref(DEFAULT_PREVIEW_PANEL_STAGE_HEIGHT)
let embeddedLaunchId = $ref<string>()
let consumedReadyLaunchId = $ref<string>()
let embeddedPreviewSlotRevision = 0
let embeddedPreviewSlotUpdateQueue = Promise.resolve()
let isPreviewInteractionReleasePending = $ref(false)
let previewInteractionReleaseFrameId: number | undefined
// 预览里的游戏是否正处于全屏（引擎点“全屏”后 iframe 会成为全屏元素）
let isPreviewFullscreen = $ref(false)
// 窗口侧的全屏补正：状态机在 ~/features/editor/preview/preview-fullscreen，这里只负责跟上窗口形态
let previewFullscreenWindow: PreviewFullscreenWindow | undefined
let previewFullscreenStatus: PreviewFullscreenStatus = { mirrored: false, corrected: false }
let previewWindowWasMaximized = false
let previewWindowResizeUnlisten: UnlistenFn | undefined
let isPreviewPanelDisposed = false

const previewViewport = usePreviewViewport({
  getCanvasSize: () => ({
    height: stageHeight,
    width: stageWidth,
  }),
  getViewportElement: () => viewportRef.value,
})
const previewCanvasStyle = $computed(() => ({
  aspectRatio,
  height: `${stageHeight}px`,
  // 全屏时把画布的缩放让开：祖先的 transform 会成为全屏 iframe 的包含块，不让开的话元素全屏
  // 只会撑满画布那一小块，而不是整个窗口
  transform: isPreviewFullscreen ? undefined : previewViewport.viewportTransform.value,
  width: `${stageWidth}px`,
}))
const previewOutputSurfaceStyle = $computed(() => ({
  // 裁剪经过 transform 放大的 iframe，避免其命中区域越出预览边界响应编辑器事件
  overflow: 'hidden' as const,
  // 同上，filter 也会成为全屏 iframe 的包含块
  filter: !isPreviewFullscreen && preferenceStore.previewBrightnessEnabled
    ? `brightness(${percentageToRatio(preferenceStore.previewBrightness[0])})`
    : undefined,
}))
const isPreviewInteractionActive = $computed(() => previewViewport.isPanning.value
  || previewViewport.isSpacePressed.value)
const isPreviewInteractionOverlayVisible = $computed(() => isPreviewInteractionActive
  || isPreviewInteractionReleasePending)
const previewInteractionOverlayStyle = $computed(() => ({
  cursor: resolvePreviewInteractionCursor(),
}))
const previewIframeStyle = $computed(() => ({
  pointerEvents: isPreviewInteractionOverlayVisible ? 'none' as const : undefined,
}))
const previewViewportClass = $computed(() => {
  if (previewViewport.isPanning.value) {
    return 'cursor-grabbing'
  }
  if (previewViewport.isSpacePressed.value) {
    return 'cursor-grab'
  }

  return ''
})

function cancelPreviewInteractionRelease(): void {
  if (previewInteractionReleaseFrameId !== undefined) {
    cancelAnimationFrame(previewInteractionReleaseFrameId)
    previewInteractionReleaseFrameId = undefined
  }

  isPreviewInteractionReleasePending = false
}

function schedulePreviewInteractionRelease(): void {
  cancelPreviewInteractionRelease()
  isPreviewInteractionReleasePending = true

  // iframe 下方元素不会在覆盖层移除时立即重新命中，保留两帧 auto 光标让浏览器完成刷新。
  previewInteractionReleaseFrameId = requestAnimationFrame(() => {
    previewInteractionReleaseFrameId = requestAnimationFrame(() => {
      previewInteractionReleaseFrameId = undefined
      isPreviewInteractionReleasePending = false
    })
  })
}

function resolvePreviewInteractionCursor(): 'auto' | 'grab' | 'grabbing' | undefined {
  if (previewViewport.isPanning.value) {
    return 'grabbing'
  }
  if (previewViewport.isSpacePressed.value) {
    return 'grab'
  }
  if (isPreviewInteractionReleasePending) {
    return 'auto'
  }

  return undefined
}

function isPointerFocusManagedByTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest(PREVIEW_WORKSPACE_FOCUSABLE_SELECTOR) !== null
}

function isPreviewViewportTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest(PREVIEW_VIEWPORT_TARGET_SELECTOR) !== null
}

function handlePreviewWorkspacePointerDown(event: PointerEvent): void {
  if (!transformOverlayEnabled || isPointerFocusManagedByTarget(event.target)) {
    return
  }

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.focus({ preventScroll: true })
  }
}

function handlePreviewViewportWheel(event: WheelEvent): void {
  if (!canPreview) {
    return
  }

  previewViewport.handleWheel(event)
}

function handlePreviewViewportPointerDown(event: PointerEvent): void {
  // 悬浮在视口内的工具栏与读数按下时不应进入空格/中键平移，平移只作用于预览画面
  if (!canPreview || isPreviewViewportTarget(event.target)) {
    return
  }

  previewViewport.handlePointerDown(event)
}

function applyStageSize(nextStageSize: PreviewPanelStageSize) {
  aspectRatio = nextStageSize.aspectRatio
  stageWidth = nextStageSize.stageWidth
  stageHeight = nextStageSize.stageHeight
}

function previewTransformOverlayDisplayTransform(value: DisplayTransform): void {
  transformOverlayBridge?.updateDisplayTransform(value)
}

function commitTransformOverlayDisplayTransform(value: DisplayTransform): void {
  transformOverlayBridge?.updateDisplayTransform(value, { flush: true })
}

function cancelTransformOverlayDisplayTransform(): void {
  transformOverlayBridge?.cancelDisplayTransform()
}

async function fitViewportToCurrentStage(): Promise<void> {
  await nextTick()
  previewViewport.fitToView()
}

async function updateAspectRatio(): Promise<void> {
  const requestedPath = workspaceStore.currentGame?.path
  if (!requestedPath) {
    applyStageSize({
      aspectRatio: DEFAULT_PREVIEW_PANEL_ASPECT_RATIO,
      stageHeight: DEFAULT_PREVIEW_PANEL_STAGE_HEIGHT,
      stageWidth: DEFAULT_PREVIEW_PANEL_STAGE_WIDTH,
    })
    await fitViewportToCurrentStage()
    return
  }

  try {
    const gameConfig = await gameCmds.getGameConfig(requestedPath)
    const nextStageSize = resolvePreviewPanelStageSize({
      currentGamePath: workspaceStore.currentGame?.path,
      gameConfig: {
        stageHeight: findGameConfigEntryValue(gameConfig.entries, 'Stage_Height'),
        stageWidth: findGameConfigEntryValue(gameConfig.entries, 'Stage_Width'),
      },
      requestedPath,
    })
    if (!nextStageSize) {
      return
    }

    applyStageSize(nextStageSize)
    await fitViewportToCurrentStage()
  } catch (error) {
    const fallbackStageSize = resolvePreviewPanelStageSize({
      currentGamePath: workspaceStore.currentGame?.path,
      requestedPath,
    })
    if (!fallbackStageSize) {
      return
    }

    logger.warn(`无法读取游戏配置，使用默认宽高比: ${error}`)
    applyStageSize(fallbackStageSize)
    await fitViewportToCurrentStage()
  }
}

function createEmbeddedPreviewLaunchId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `embedded-preview-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function updateEmbeddedPreviewSlot(nextEmbeddedLaunchId?: string): void {
  const revision = ++embeddedPreviewSlotRevision
  embeddedLaunchId = nextEmbeddedLaunchId
  consumedReadyLaunchId = undefined
  if (nextEmbeddedLaunchId) {
    previewSyncStore.startEmbeddedPreviewConnection()
  } else {
    previewSyncStore.resetEmbeddedPreviewState()
  }

  embeddedPreviewSlotUpdateQueue = embeddedPreviewSlotUpdateQueue
    .catch(() => undefined)
    .then(async () => {
      if (revision !== embeddedPreviewSlotRevision) {
        return
      }

      try {
        await previewRuntimeStore.setEmbeddedPreviewLaunchId(nextEmbeddedLaunchId)
      } catch (error) {
        logger.error(`更新内嵌预览槽位失败: ${error}`)
      }
    })
}

function refreshEmbeddedPreviewSlot(): void {
  const nextEmbeddedLaunchId = canPreview ? createEmbeddedPreviewLaunchId() : undefined
  updateEmbeddedPreviewSlot(nextEmbeddedLaunchId)
}

let refreshKey = $ref(0)

function refreshIframe(): void {
  refreshKey++
  refreshEmbeddedPreviewSlot()
  void updateAspectRatio()
}

async function openPreviewInBrowser(): Promise<void> {
  if (!canPreview) {
    return
  }

  try {
    await openUrl(previewUrl)
  } catch (error: unknown) {
    handleError(error, { context: t('edit.previewPanel.openFailed') })
  }
}

function handleEmbeddedPreviewBootstrap(event: MessageEvent<unknown>): void {
  if (!embeddedLaunchId || !previewUrl || !isPreviewBootstrapRequestMessage(event.data)) {
    return
  }

  const target = resolveEmbeddedPreviewTarget(event)
  if (!target) {
    return
  }

  target.window.postMessage(
    createPreviewBootstrapProvideMessage(embeddedLaunchId),
    target.origin,
  )
}

function resolveEmbeddedPreviewTarget(event: MessageEvent<unknown>): {
  origin: string
  window: Window
} | undefined {
  const iframeWindow = iframeRef.value?.contentWindow
  const previewOrigin = resolvePreviewOrigin()
  if (!previewOrigin || !iframeWindow) {
    return undefined
  }

  if (event.source !== iframeWindow || event.origin !== previewOrigin) {
    return undefined
  }

  return {
    origin: previewOrigin,
    window: iframeWindow,
  }
}

function resolvePreviewOrigin(): string | undefined {
  if (!previewUrl) {
    return undefined
  }

  try {
    return new URL(previewUrl).origin
  } catch {
    return undefined
  }
}

function percentageToRatio(percentage: number): number {
  return Math.min(Math.max(percentage / 100, 0), 1)
}

function postPreviewOutputSettings(): void {
  const iframeWindow = iframeRef.value?.contentWindow
  const previewOrigin = resolvePreviewOrigin()
  if (!iframeWindow || !previewOrigin) {
    return
  }

  iframeWindow.postMessage(
    createPreviewOutputSettingsMessage({
      muted: preferenceStore.previewMuted,
      volume: percentageToRatio(preferenceStore.previewVolume[0]),
    }),
    previewOrigin,
  )
}

function postEmbeddedPreviewSpaceKey(pressed: boolean): void {
  const iframeWindow = iframeRef.value?.contentWindow
  const previewOrigin = resolvePreviewOrigin()
  if (!iframeWindow || !previewOrigin) {
    return
  }

  iframeWindow.postMessage(createPreviewViewportSpaceKeyMessage(pressed), previewOrigin)
}

function handleEmbeddedPreviewWheel(event: MessageEvent<unknown>): void {
  if (!isPreviewViewportWheelMessage(event.data)) {
    return
  }

  if (!resolveEmbeddedPreviewTarget(event)) {
    return
  }

  previewViewport.zoomByWheelAtCanvasPoint(event.data.deltaY, {
    x: event.data.clientX,
    y: event.data.clientY,
  })
}

function handleEmbeddedPreviewPointer(event: MessageEvent<unknown>): void {
  if (!isPreviewViewportPointerMessage(event.data)) {
    return
  }

  if (!resolveEmbeddedPreviewTarget(event)) {
    return
  }

  previewViewport.handleForwardedPointerEvent(event.data)
}

function handleEmbeddedPreviewSpaceKey(event: MessageEvent<unknown>): void {
  if (!isPreviewViewportSpaceKeyMessage(event.data)) {
    return
  }

  if (!resolveEmbeddedPreviewTarget(event)) {
    return
  }

  previewViewport.setSpacePressed(event.data.pressed)
}

function resolveCurrentReadySyncTarget() {
  const currentState = editorStore.currentState
  const activeDocumentKind = currentState && 'kind' in currentState ? currentState.kind : undefined
  const activeDocumentPath = currentState && 'path' in currentState ? currentState.path : undefined

  return resolvePreviewReadySyncTarget({
    activeDocumentKind,
    activeDocumentPath,
    selectedLineNumber: editorStore.currentSceneSelection?.lastLineNumber,
    textContent: editorStore.currentTextProjection?.textContent,
  })
}

async function initializeEmbeddedPreview(currentEmbeddedLaunchId: string): Promise<void> {
  consumedReadyLaunchId = currentEmbeddedLaunchId

  try {
    const syncTarget = resolveCurrentReadySyncTarget()
    if (!syncTarget) {
      return
    }

    await debugCommander.syncScene(
      syncTarget.path,
      syncTarget.lineNumber,
      syncTarget.lineText,
      { force: true },
    )
  } catch (error) {
    consumedReadyLaunchId = undefined
    logger.error(`初始化内嵌预览失败: ${error}`)
  }
}

/**
 * 预览全屏状态变化：全屏期间让开画布的 transform / filter，并让窗口跟上
 * （最大化窗口直接进全屏会留下任务栏高度的黑边，见 preview-fullscreen.ts）。
 */
function handlePreviewFullscreenChange(): void {
  isPreviewFullscreen = document.fullscreenElement === iframeRef.value
  const appWindow = previewFullscreenWindow
  if (!appWindow) {
    return
  }

  const next = previewFullscreenTransition(previewFullscreenStatus, {
    fullscreenActive: isPreviewFullscreen,
    windowWasMaximized: previewWindowWasMaximized,
  })
  previewFullscreenStatus = { mirrored: next.mirrored, corrected: next.corrected }
  void applyPreviewFullscreenAction(appWindow, next.action).catch((error: unknown) => {
    logger.warn(`预览全屏的窗口处理失败: ${error}`)
  })
}

/** 记录进入全屏前的窗口形态；全屏期间那一次 resize 正是要修的形态变化，不能当作依据。 */
function syncPreviewWindowMaximized(): void {
  const appWindow = previewFullscreenWindow
  if (!appWindow || document.fullscreenElement !== null) {
    return
  }

  void appWindow.isMaximized()
    .then((maximized) => {
      previewWindowWasMaximized = maximized
    })
    .catch(() => {
      // 问不到就按非最大化处理
    })
}

/** 接上窗口；前端跑在浏览器里（没有 Tauri 运行时）时安静跳过。 */
function installPreviewWindowTracking(): void {
  let appWindow: WebviewWindow | undefined
  try {
    appWindow = getCurrentWebviewWindow()
  } catch {
    // 没有 Tauri 运行时就没有窗口可接
  }
  if (!appWindow) {
    return
  }

  previewFullscreenWindow = appWindow
  syncPreviewWindowMaximized()
  void appWindow.onResized(syncPreviewWindowMaximized)
    .then((unlisten) => {
      if (isPreviewPanelDisposed) {
        unlisten()
        return
      }
      previewWindowResizeUnlisten = unlisten
    })
    .catch(() => {
      // 接不上窗口形态变化就按非最大化处理
    })
}

useEventListener(globalThis, 'message', handleEmbeddedPreviewBootstrap)
useEventListener(globalThis, 'message', handleEmbeddedPreviewPointer)
useEventListener(globalThis, 'message', handleEmbeddedPreviewSpaceKey)
useEventListener(globalThis, 'message', handleEmbeddedPreviewWheel)
useEventListener(document, 'fullscreenchange', handlePreviewFullscreenChange)
useResizeObserver(viewportRef, () => {
  previewViewport.syncFitToViewport()
})

watch(
  () => previewViewport.isSpacePressed.value,
  (isSpacePressed) => {
    postEmbeddedPreviewSpaceKey(isSpacePressed)
  },
  { flush: 'sync' },
)

watch(
  () => isPreviewInteractionActive,
  (isPreviewInteractionActive) => {
    if (isPreviewInteractionActive) {
      cancelPreviewInteractionRelease()
      return
    }

    schedulePreviewInteractionRelease()
  },
  { flush: 'sync' },
)

watch(
  () => workspaceStore.currentGame?.path,
  () => {
    void updateAspectRatio()
  },
  { immediate: true },
)

watch(
  () => previewSessionStore.reloadVersion,
  () => {
    refreshIframe()
  },
)

watch(
  () => previewUrl,
  () => {
    refreshEmbeddedPreviewSlot()
  },
  { immediate: true },
)

watch(
  [
    () => preferenceStore.previewVolume[0],
    () => preferenceStore.previewMuted,
  ],
  postPreviewOutputSettings,
  { flush: 'post' },
)

watch(
  () => sceneEntryStatus.status.value,
  (status, previousStatus) => {
    if (status !== 'valid') {
      updateEmbeddedPreviewSlot(undefined)
      return
    }

    if (previousStatus !== 'valid' && hasPreviewUrl) {
      previewSessionStore.refresh()
    }
  },
)

watch(
  [() => previewSyncStore.isPreviewReady, () => embeddedLaunchId],
  ([isPreviewReady, currentEmbeddedLaunchId]) => {
    if (!isPreviewReady || !currentEmbeddedLaunchId || consumedReadyLaunchId === currentEmbeddedLaunchId) {
      return
    }

    void initializeEmbeddedPreview(currentEmbeddedLaunchId)
  },
)

watch(
  () => previewSyncStore.fastPreviewTimeout,
  (payload) => {
    if (!payload) {
      return
    }

    modalStore.open(
      'FastPreviewTimeoutModal',
      {
        payload,
        onClose: previewSyncStore.dismissFastPreviewTimeout,
      },
    )
  },
)

useShortcutContext({
  panelFocus: 'transformOverlay',
}, {
  active: computed(() => transformOverlayEnabled),
  target: previewWorkspaceRef,
  trackFocus: true,
})

onMounted(() => {
  void fitViewportToCurrentStage()
  installPreviewWindowTracking()
})

onBeforeUnmount(() => {
  cancelPreviewInteractionRelease()
  updateEmbeddedPreviewSlot(undefined)
  isPreviewPanelDisposed = true
  previewWindowResizeUnlisten?.()
  // 面板卸载会把 iframe 一起摘掉，元素全屏随之结束，而那次 fullscreenchange 我们未必还能听到
  const appWindow = previewFullscreenWindow
  if (appWindow && previewFullscreenStatus.corrected) {
    previewFullscreenStatus = { mirrored: false, corrected: false }
    void applyPreviewFullscreenAction(appWindow, { kind: 'restore-maximized' }).catch(() => {
      // 还原失败只能留给用户自己恢复窗口形态，不该影响卸载流程
    })
  }
})
</script>

<template>
  <div data-tour="preview-panel" class="flex flex-col h-full divide-y">
    <PreviewToolbar
      :connection-status="previewConnectionStatus"
      :preview-available="canPreview"
      @open-in-browser="openPreviewInBrowser"
      @refresh="previewSessionStore.refresh()"
    />
    <div
      ref="previewWorkspace"
      data-drawer-interactive-region
      tabindex="-1"
      class="outline-none flex flex-1 flex-col min-h-0"
      @pointerdown="handlePreviewWorkspacePointerDown"
    >
      <div
        ref="viewportRef"
        data-testid="preview-viewport"
        class="flex-1 min-h-0 relative overflow-hidden"
        :class="previewViewportClass"
        @wheel="handlePreviewViewportWheel"
        @pointerdown="handlePreviewViewportPointerDown"
      >
        <div
          data-testid="preview-output-surface"
          class="bg-muted inset-0 absolute"
          :style="previewOutputSurfaceStyle"
        >
          <div
            v-if="canPreview"
            data-testid="preview-canvas"
            class="bg-background shadow-sm origin-top-left left-0 top-0 absolute"
            :style="previewCanvasStyle"
          >
            <iframe
              ref="iframeRef"
              :key="refreshKey"
              :src="previewUrl"
              :title="previewTitle"
              class="border-0 size-full"
              :style="previewIframeStyle"
              allow="fullscreen"
              allowfullscreen
              @load="postPreviewOutputSettings"
            />
          </div>
        </div>
        <TransformOverlay
          v-if="canPreview && transformOverlayEnabled"
          :box="transformOverlayReferenceBox"
          :canvas-height="stageHeight"
          :canvas-placement="previewViewport.canvasPlacement.value"
          :canvas-width="stageWidth"
          :display-transform="transformOverlayDisplayTransform"
          @cancel:display-transform="cancelTransformOverlayDisplayTransform"
          @commit:display-transform="commitTransformOverlayDisplayTransform"
          @preview:display-transform="previewTransformOverlayDisplayTransform"
        />
        <div
          v-if="hasMissingEntryPoint"
          data-testid="preview-missing-entry-overlay"
          role="alert"
          class="p-6 text-center bg-muted flex flex-col gap-1 items-center inset-0 justify-center absolute z-10"
        >
          <p class="font-medium">
            {{ $t('edit.previewPanel.missingEntryTitle') }}
          </p>
          <p class="text-sm text-muted-foreground max-w-80">
            {{ $t('edit.previewPanel.missingEntryDescription') }}
          </p>
        </div>
        <div
          v-if="isPreviewInteractionOverlayVisible"
          data-testid="preview-interaction-overlay"
          aria-hidden="true"
          class="inset-0 absolute z-5"
          :style="previewInteractionOverlayStyle"
        />
        <output
          v-if="canPreview"
          data-testid="preview-resolution"
          class="text-xs text-muted-foreground leading-none font-medium font-mono px-2 border rounded-md bg-background/80 flex h-7 pointer-events-none select-none whitespace-nowrap items-center bottom-1 left-1 absolute z-10 backdrop-blur-sm tabular-nums"
          :aria-label="$t('edit.previewPanel.resolution')"
        >
          {{ resolutionLabel }}
        </output>
        <div
          v-if="canPreview"
          data-testid="preview-bottom-toolbar"
          data-preview-viewport-chrome
          class="text-muted-foreground px-0.5 border rounded-md bg-background/80 flex h-7 cursor-default items-center bottom-1 right-1 absolute z-10 backdrop-blur-sm"
        >
          <ViewportControls
            :zoom-ratio="previewViewport.zoomRatio.value"
            @zoom-in="previewViewport.zoomIn"
            @zoom-out="previewViewport.zoomOut"
            @fit-to-view="previewViewport.fitToView"
          />
        </div>
      </div>
    </div>
  </div>
</template>
