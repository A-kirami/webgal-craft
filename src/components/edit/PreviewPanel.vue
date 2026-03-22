<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { Copy, ExternalLink, Link, RotateCw } from 'lucide-vue-next'

import { gameCmds } from '~/commands/game'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'

const DEFAULT_ASPECT_RATIO = '16/9'

const workspaceStore = useWorkspaceStore()

const previewUrl = $computed(() => workspaceStore.currentGameServeUrl ?? '')
const hasPreviewUrl = $computed(() => !!workspaceStore.currentGameServeUrl)

const { t } = useI18n()
const { copy, copied } = useClipboard({ source: $$(previewUrl) })
const previewTitle = $computed(() => t('edit.previewPanel.previewTitle', { name: workspaceStore.currentGame?.metadata.name }))

let aspectRatio = $ref(DEFAULT_ASPECT_RATIO)

function applyAspectRatio(stageWidth: number, stageHeight: number): void {
  aspectRatio = `${stageWidth}/${stageHeight}`
  logger.debug(`预览面板分辨率: ${stageWidth}x${stageHeight}`)
}

async function updateAspectRatio(): Promise<void> {
  const requestedPath = workspaceStore.currentGame?.path
  if (!requestedPath) {
    aspectRatio = DEFAULT_ASPECT_RATIO
    return
  }

  try {
    const gameConfig = await gameCmds.getGameConfig(requestedPath)
    if (workspaceStore.currentGame?.path !== requestedPath) {
      return
    }

    const stageWidth = Number(gameConfig.stageWidth) || 2560
    const stageHeight = Number(gameConfig.stageHeight) || 1440
    applyAspectRatio(stageWidth, stageHeight)
  } catch (error) {
    if (workspaceStore.currentGame?.path !== requestedPath) {
      return
    }

    logger.warn(`无法读取游戏配置，使用默认宽高比: ${error}`)
    aspectRatio = DEFAULT_ASPECT_RATIO
  }
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

watch(
  () => workspaceStore.currentGame,
  () => {
    void updateAspectRatio()
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex flex-col h-full divide-y">
    <div class="px-2 py-1 flex flex-shrink-0 gap-2 items-center justify-between">
      <div class="text-muted-foreground px-2 py-0.25 border border-border/50 rounded-md bg-muted/50 flex flex-1 gap-1.5 items-center overflow-hidden">
        <Link class="shrink-0 size-3" />
        <span class="text-sm font-mono select-text truncate">{{ previewUrl }}</span>
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
              <Button variant="ghost" size="icon" class="size-6" @click="refreshIframe">
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
          :key="refreshKey"
          :src="previewUrl"
          :title="previewTitle"
          class="size-full"
        />
      </div>
    </div>
  </div>
</template>
