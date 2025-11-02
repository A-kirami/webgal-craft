<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { Copy, ExternalLink, Link, RotateCw } from 'lucide-vue-next'

const workspaceStore = useWorkspaceStore()

const previewUrl = $computed(() => workspaceStore.currentGamePreviewUrl || '')
const hasPreviewUrl = $computed(() => !!workspaceStore.currentGamePreviewUrl)

const { copy, copied } = useClipboard({ source: previewUrl })

function copyUrl() {
  if (hasPreviewUrl) {
    copy()
    if (copied) {
      notify.success('复制地址成功')
    }
  }
}

let refreshKey = $ref(0)

function refreshIframe() {
  refreshKey++
}

function openPreviewInBrowser() {
  if (hasPreviewUrl) {
    openUrl(previewUrl)
  }
}
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
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>复制地址</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="ghost" size="icon" class="size-6" @click="refreshIframe">
                <RotateCw class="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>刷新预览</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="ghost" size="icon" class="size-6" @click="openPreviewInBrowser">
                <ExternalLink class="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>在浏览器中打开</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
    <div class="bg-muted size-full relative">
      <div v-if="hasPreviewUrl" class="m-auto max-h-full aspect-16/9 inset-0 absolute">
        <iframe
          :key="refreshKey"
          :src="previewUrl"
          :title="`游戏预览 - ${workspaceStore.currentGame?.metadata.name}`"
          class="size-full"
        />
      </div>
    </div>
  </div>
</template>
