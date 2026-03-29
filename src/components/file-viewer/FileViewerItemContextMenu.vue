<script setup lang="ts">
import { FileViewerItem } from '~/types/file-viewer'

interface Props {
  item: FileViewerItem
  enabled?: boolean
}

const {
  item,
  enabled = false,
} = defineProps<Props>()
</script>

<template>
  <ContextMenu v-if="enabled">
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="w-52" @close-auto-focus.prevent>
      <slot name="context-menu" :item="item" />
    </ContextMenuContent>
  </ContextMenu>
  <slot v-else />
</template>
