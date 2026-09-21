<script setup lang="ts">
import { AlertTriangle, FolderOpen } from '@lucide/vue'

interface FileViewerStateProps {
  isLoading: boolean
  errorMsg: string
  isEmpty: boolean
  /** 空状态标题，未提供时使用通用文案 */
  emptyTitle?: string
  /** 空状态补充提示，例如当前上下文支持的导入方式 */
  emptyHint?: string
}

const {
  isLoading,
  errorMsg,
  isEmpty,
  emptyTitle = '',
  emptyHint = '',
} = defineProps<FileViewerStateProps>()
</script>

<template>
  <div v-if="isLoading" class="flex h-full items-center justify-center">
    <div class="text-muted-foreground flex items-center justify-center">
      <div class="border-2 border-current border-t-transparent rounded-full size-5 animate-spin" />
    </div>
    <span class="sr-only">{{ $t('common.loading') }}</span>
  </div>

  <div v-else-if="errorMsg" class="flex flex-col h-full w-full items-center justify-center">
    <AlertTriangle class="text-destructive mb-2 size-10" :stroke-width="1.25" />
    <span class="text-xs text-destructive">{{ $t('common.fileViewer.loadFailed', { error: errorMsg }) }}</span>
  </div>

  <div v-else-if="isEmpty" class="flex flex-col h-full w-full items-center justify-center">
    <FolderOpen class="text-muted-foreground mb-2 size-10" :stroke-width="1.25" />
    <span class="text-xs text-muted-foreground">{{ emptyTitle || $t('common.fileViewer.noContent') }}</span>
    <span v-if="emptyHint" class="text-xs text-muted-foreground/70 mt-1">{{ emptyHint }}</span>
  </div>
</template>
