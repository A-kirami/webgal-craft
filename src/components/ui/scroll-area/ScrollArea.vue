<script setup lang="ts">
import { cn } from '~/lib/utils'
import {
  ScrollAreaCorner,
  ScrollAreaRoot,
  type ScrollAreaRootProps,
  ScrollAreaViewport,
} from 'reka-ui'
import { computed, type HTMLAttributes } from 'vue'
import ScrollBar from './ScrollBar.vue'

const props = defineProps<ScrollAreaRootProps & {
  class?: HTMLAttributes['class']
  onScroll?: (event: Event) => void
  ,onWheel?: (event: WheelEvent) => void
}>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const viewportRef = useTemplateRef('viewportRef')

defineExpose({
  viewport: viewportRef,
})
</script>

<template>
  <ScrollAreaRoot v-bind="delegatedProps" :class="cn('relative overflow-hidden', props.class)">
    <ScrollAreaViewport ref="viewportRef" class="h-full w-full rounded-[inherit]" @scroll="onScroll" @wheel="onWheel">
      <slot />
    </ScrollAreaViewport>
    <ScrollBar />
    <ScrollAreaCorner />
  </ScrollAreaRoot>
</template>
