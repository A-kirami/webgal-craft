<script setup lang="ts">
import { ResizablePanel } from '~/components/ui/resizable'

interface Props {
  show?: boolean
  mainMinSize?: number
  sidebarDefaultSize?: number
  sidebarMinSize?: number
}

withDefaults(defineProps<Props>(), {
  show: false,
  mainMinSize: 25,
  sidebarDefaultSize: 30,
  sidebarMinSize: 15,
})

defineOptions({ inheritAttrs: false })
</script>

<template>
  <ResizablePanelGroup direction="horizontal" v-bind="$attrs">
    <ResizablePanel :default-size="show ? (100 - sidebarDefaultSize) : 100" :min-size="mainMinSize">
      <slot />
    </ResizablePanel>
    <template v-if="show">
      <ResizableHandle />
      <ResizablePanel :default-size="sidebarDefaultSize" :min-size="sidebarMinSize">
        <slot name="sidebar" />
      </ResizablePanel>
    </template>
  </ResizablePanelGroup>
</template>
