<script setup lang="ts">
import { Copy, ExternalLink, Link, RotateCw } from '@lucide/vue'
import { openUrl } from '@tauri-apps/plugin-opener'

import { findGameConfigEntryValue, gameCmds } from '~/commands/game'
import { usePreviewViewport } from '~/composables/usePreviewViewport'
import {
  createPreviewBootstrapProvideMessage,
  createPreviewViewportSpaceKeyMessage,
  isPreviewBootstrapRequestMessage,
  isPreviewViewportPointerMessage,
  isPreviewViewportSpaceKeyMessage,
  isPreviewViewportWheelMessage,
} from '~/features/editor/preview/embedded-preview-messages'
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
import { usePreviewRuntimeStore } from '~/stores/preview-runtime'
import { usePreviewSessionStore } from '~/stores/preview-session'
import { usePreviewSyncStore } from '~/stores/preview-sync'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'

import TransformOverlay from './TransformOverlay.vue'
import ViewportControls from './ViewportControls.vue'

import type { PreviewPanelStageSize } from '~/features/editor/preview/preview-panel'
import type { DisplayTransform } from '~/features/editor/transform-overlay/model'

const editorStore = useEditorStore()
const modalStore = useModalStore()
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

const { t } = useI18n()
const { copy } = useClipboard({ source: $$(previewUrl) })
const previewTitle = $computed(() => t('edit.previewPanel.previewTitle', { name: workspaceStore.currentGame?.metadata.name }))
const resolutionLabel = $computed(() => `${stageWidth} x ${stageHeight}`)

const PREVIEW_WORKSPACE_FOCUSABLE_SELECTOR = 'a[href], button, input, textarea, select, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'

let aspectRatio = $ref(DEFAULT_PREVIEW_PANEL_ASPECT_RATIO)
let stageWidth = $ref(DEFAULT_PREVIEW_PANEL_STAGE_WIDTH)
let stageHeight = $ref(DEFAULT_PREVIEW_PANEL_STAGE_HEIGHT)
let embeddedLaunchId = $ref<string>()
let consumedReadyLaunchId = $ref<string>()
let embeddedPreviewSlotRevision = 0
let embeddedPreviewSlotUpdateQueue = Promise.resolve()
let isPreviewInteractionReleasePending = $ref(false)
let previewInteractionReleaseFrameId: number | undefined

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
  transform: previewViewport.viewportTransform.value,
  width: `${stageWidth}px`,
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
  if (!canPreview) {
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
  previewSyncStore.resetEmbeddedPreviewState()

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

async function copyUrl(): Promise<void> {
  if (!canPreview) {
    return
  }

  await copy()
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

useEventListener(globalThis, 'message', handleEmbeddedPreviewBootstrap)
useEventListener(globalThis, 'message', handleEmbeddedPreviewPointer)
useEventListener(globalThis, 'message', handleEmbeddedPreviewSpaceKey)
useEventListener(globalThis, 'message', handleEmbeddedPreviewWheel)
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
})

onBeforeUnmount(() => {
  cancelPreviewInteractionRelease()
  updateEmbeddedPreviewSlot(undefined)
})
</script>

<template>
  <div class="flex flex-col h-full divide-y">
    <div class="px-2 py-1 flex flex-shrink-0 gap-2 items-center justify-between">
      <div class="text-muted-foreground px-2 py-0.25 border border-border/50 rounded-md bg-muted/50 flex flex-1 gap-1.5 items-center overflow-hidden">
        <Link class="shrink-0 size-3" />
        <span class="text-sm font-mono cursor-default select-text truncate">{{ previewUrl }}</span>
      </div>
      <TooltipProvider>
        <div class="text-muted-foreground flex flex-shrink-0 gap-1">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="ghost" size="icon" class="size-6" :disabled="!canPreview" @click="copyUrl">
                <Copy class="size-4" />
                <span class="sr-only">{{ $t('edit.previewPanel.copyUrl') }}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ $t('edit.previewPanel.copyUrl') }}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="ghost" size="icon" class="size-6" :disabled="!canPreview" @click="previewSessionStore.refresh()">
                <RotateCw class="size-4" />
                <span class="sr-only">{{ $t('edit.previewPanel.refreshPreview') }}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ $t('edit.previewPanel.refreshPreview') }}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="ghost" size="icon" class="size-6" :disabled="!canPreview" @click="openPreviewInBrowser">
                <ExternalLink class="size-4" />
                <span class="sr-only">{{ $t('edit.previewPanel.openInBrowser') }}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ $t('edit.previewPanel.openInBrowser') }}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
    <div
      ref="previewWorkspace"
      data-effect-editor-interactive-region
      tabindex="-1"
      class="outline-none flex flex-1 flex-col min-h-0 divide-y"
      @pointerdown="handlePreviewWorkspacePointerDown"
    >
      <div
        ref="viewportRef"
        data-testid="preview-viewport"
        class="bg-muted flex-1 min-h-0 relative overflow-hidden"
        :class="previewViewportClass"
        @wheel="handlePreviewViewportWheel"
        @pointerdown="handlePreviewViewportPointerDown"
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
          />
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
      </div>
      <div
        v-if="hasPreviewUrl"
        data-testid="preview-bottom-toolbar"
        class="text-muted-foreground px-2 bg-background/80 flex flex-shrink-0 h-6.5 items-center justify-between"
      >
        <output
          data-testid="preview-resolution"
          class="text-xs leading-none font-medium font-mono pointer-events-none select-none tabular-nums"
          :aria-label="$t('edit.previewPanel.resolution')"
        >
          {{ resolutionLabel }}
        </output>
        <ViewportControls
          :disabled="!canPreview"
          :zoom-ratio="previewViewport.zoomRatio.value"
          @zoom-in="previewViewport.zoomIn"
          @zoom-out="previewViewport.zoomOut"
          @fit-to-view="previewViewport.fitToView"
        />
      </div>
    </div>
  </div>
</template>
