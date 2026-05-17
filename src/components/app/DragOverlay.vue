<script setup lang="ts">
import type { StyleValue } from 'vue'

interface DragOverlayProps {
  frameStyle?: StyleValue
  overlayStyle?: StyleValue
  visible?: boolean
}

const props = defineProps<DragOverlayProps>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.visible"
      class="pointer-events-none inset-0 fixed z-[9999] overflow-hidden"
      :style="props.frameStyle"
      aria-hidden="true"
    >
      <div
        class="pointer-events-none select-none left-0 top-0 absolute"
        :style="props.overlayStyle"
      >
        <slot>
          <div class="border border-border/70 rounded-md bg-background/90 h-8 min-w-16 shadow-lg backdrop-blur-sm" />
        </slot>
      </div>
    </div>
  </Teleport>
</template>
