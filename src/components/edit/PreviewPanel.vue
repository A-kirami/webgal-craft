<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { Copy, ExternalLink, Link, RotateCw } from 'lucide-vue-next'

const workspaceStore = useWorkspaceStore()

const previewUrl = $computed(() => workspaceStore.currentGamePreviewUrl || '')
const hasPreviewUrl = $computed(() => !!workspaceStore.currentGamePreviewUrl)

const { t } = useI18n()
const { copy, copied } = useClipboard({ source: previewUrl })

let aspectRatio = $ref('16/9')

async function updateAspectRatio() {
  if (!workspaceStore.currentGame) {
    return
  }

  try {
    const gameConfig = await gameCmds.getGameConfig(workspaceStore.currentGame.path)
    const stageWidth = Number(gameConfig.stageWidth) || 2560
    const stageHeight = Number(gameConfig.stageHeight) || 1440
    aspectRatio = `${stageWidth}/${stageHeight}`
    logger.debug(`预览面板分辨率: ${stageWidth}x${stageHeight} (${aspectRatio})`)
  } catch (error) {
    logger.warn(`无法读取游戏配置，使用默认宽高比: ${error}`)
    aspectRatio = '16/9'
  }
}

function copyUrl() {
  if (hasPreviewUrl) {
    copy()
    if (copied) {
      notify.success(t('edit.previewPanel.copyUrlSuccess'))
    }
  }
}

let refreshKey = $ref(0)

function refreshIframe() {
  refreshKey++
  updateAspectRatio()
}

async function openPreviewInBrowser() {
  if (!hasPreviewUrl) {
    return
  }

  try {
    await openUrl(previewUrl)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    notify.error(t('edit.previewPanel.openFailed', { error: errorMessage }))
  }
}

watch(
  () => workspaceStore.currentGame,
  () => {
    updateAspectRatio()
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
          :title="$t('edit.previewPanel.previewTitle', { name: workspaceStore.currentGame?.metadata.name })"
          class="size-full"
        />
      </div>
    </div>
  </div>
</template>
