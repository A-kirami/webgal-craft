<script setup lang="ts">
import type { StyleValue } from 'vue'

interface DragOverlayProps {
  overlayStyle?: StyleValue
  visible?: boolean
}

const props = defineProps<DragOverlayProps>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.visible"
      class="pointer-events-none select-none left-0 top-0 fixed"
      :style="props.overlayStyle"
      aria-hidden="true"
    >
      <slot>
        <div class="border border-border/70 rounded-md bg-background/90 h-8 min-w-16 shadow-lg backdrop-blur-sm" />
      </slot>
    </div>
  </Teleport>
</template>
