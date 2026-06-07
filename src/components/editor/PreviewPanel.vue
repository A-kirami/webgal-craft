<script setup lang="ts">
import { Copy, ExternalLink, Link, RotateCw } from '@lucide/vue'
import { openUrl } from '@tauri-apps/plugin-opener'

import { findGameConfigEntryValue, gameCmds } from '~/commands/game'
import {
  createPreviewBootstrapProvideMessage,
  isPreviewBootstrapRequestMessage,
} from '~/features/editor/preview/embedded-preview-bootstrap'
import {
  DEFAULT_PREVIEW_PANEL_ASPECT_RATIO,
  resolvePreviewPanelStageSize,
} from '~/features/editor/preview/preview-panel'
import { resolvePreviewReadySyncTarget } from '~/features/editor/preview/preview-ready-sync-target'
import { debugCommander } from '~/services/debug-commander'
import { useEditorStore } from '~/stores/editor'
import { useModalStore } from '~/stores/modal'
import { usePreviewRuntimeStore } from '~/stores/preview-runtime'
import { usePreviewSessionStore } from '~/stores/preview-session'
import { usePreviewSyncStore } from '~/stores/preview-sync'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'

const editorStore = useEditorStore()
const modalStore = useModalStore()
const previewRuntimeStore = usePreviewRuntimeStore()
const previewSessionStore = usePreviewSessionStore()
const previewSyncStore = usePreviewSyncStore()
const workspaceStore = useWorkspaceStore()
const iframeRef = useTemplateRef<HTMLIFrameElement>('iframeRef')

const previewUrl = $computed(() => previewSessionStore.currentGameServeUrl ?? '')
const hasPreviewUrl = $computed(() => !!previewSessionStore.currentGameServeUrl)

const { t } = useI18n()
const { copy, copied } = useClipboard({ source: $$(previewUrl) })
const previewTitle = $computed(() => t('edit.previewPanel.previewTitle', { name: workspaceStore.currentGame?.metadata.name }))

let aspectRatio = $ref(DEFAULT_PREVIEW_PANEL_ASPECT_RATIO)
let embeddedLaunchId = $ref<string>()
let consumedReadyLaunchId = $ref<string>()
let embeddedPreviewSlotRevision = 0
let embeddedPreviewSlotUpdateQueue = Promise.resolve()

async function updateAspectRatio(): Promise<void> {
  const requestedPath = workspaceStore.currentGame?.path
  if (!requestedPath) {
    aspectRatio = DEFAULT_PREVIEW_PANEL_ASPECT_RATIO
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

    aspectRatio = nextStageSize.aspectRatio
  } catch (error) {
    const fallbackStageSize = resolvePreviewPanelStageSize({
      currentGamePath: workspaceStore.currentGame?.path,
      requestedPath,
    })
    if (!fallbackStageSize) {
      return
    }

    logger.warn(`无法读取游戏配置，使用默认宽高比: ${error}`)
    aspectRatio = fallbackStageSize.aspectRatio
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
  const nextEmbeddedLaunchId = hasPreviewUrl ? createEmbeddedPreviewLaunchId() : undefined
  updateEmbeddedPreviewSlot(nextEmbeddedLaunchId)
}

async function copyUrl(): Promise<void> {
  if (!hasPreviewUrl) {
    return
  }

  await copy()
  if (copied.value) {
    notify.success(t('edit.previewPanel.copyUrlSuccess'))
  }
}

let refreshKey = $ref(0)

function refreshIframe(): void {
  refreshKey++
  refreshEmbeddedPreviewSlot()
  void updateAspectRatio()
}

async function openPreviewInBrowser(): Promise<void> {
  if (!hasPreviewUrl) {
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

  let previewOrigin: string
  try {
    previewOrigin = new URL(previewUrl).origin
  } catch {
    return
  }

  const iframeWindow = iframeRef.value?.contentWindow
  if (!iframeWindow || event.source !== iframeWindow || event.origin !== previewOrigin) {
    return
  }

  iframeWindow.postMessage(
    createPreviewBootstrapProvideMessage(embeddedLaunchId),
    previewOrigin,
  )
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
      true,
    )
  } catch (error) {
    consumedReadyLaunchId = undefined
    logger.error(`初始化内嵌预览失败: ${error}`)
  }
}

useEventListener(globalThis, 'message', handleEmbeddedPreviewBootstrap)

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

onBeforeUnmount(() => {
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
              <Button variant="ghost" size="icon" class="size-6" @click="copyUrl">
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
              <Button variant="ghost" size="icon" class="size-6" @click="previewSessionStore.refresh()">
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
              <Button variant="ghost" size="icon" class="size-6" @click="openPreviewInBrowser">
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
    <div class="bg-muted size-full relative">
      <div v-if="hasPreviewUrl" class="m-auto max-h-full inset-0 absolute" :style="{ aspectRatio }">
        <iframe
          ref="iframeRef"
          :key="refreshKey"
          :src="previewUrl"
          :title="previewTitle"
          class="size-full"
        />
      </div>
    </div>
  </div>
</template>
