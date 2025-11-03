<script setup lang="ts">
import { ResizablePanel } from '~/components/ui/resizable'

// const props = defineProps<{
//   path: string
//   data: unknown
// }>()

/* eslint-disable @intlify/vue-i18n/no-raw-text */
</script>

<template>
  <ResizablePanelGroup direction="vertical">
    <ResizablePanel :default-size="85" :min-size="50">
      可视化脚本编辑器
    </ResizablePanel>
    <ResizableHandle />
    <ResizablePanel :default-size="15" :max-size="30">
      命令面板
    </ResizablePanel>
  </ResizablePanelGroup>
</template>
