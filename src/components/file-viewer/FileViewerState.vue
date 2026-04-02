<script setup lang="ts">
import { AlertTriangle, FolderOpen } from '@lucide/vue'

interface FileViewerStateProps {
  isLoading: boolean
  errorMsg: string
  isEmpty: boolean
}

const {
  isLoading,
  errorMsg,
  isEmpty,
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
    <span class="text-xs text-muted-foreground">{{ $t('common.fileViewer.noContent') }}</span>
  </div>
</template>
