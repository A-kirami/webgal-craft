<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import {
  ProgressIndicator,
  ProgressRoot,
  type ProgressRootProps,
} from 'reka-ui'
import { cn } from '~/lib/utils'

const props = withDefaults(
  defineProps<ProgressRootProps & { class?: HTMLAttributes['class'], animation?: boolean }>(),
  {
    modelValue: 0,
  },
)

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <ProgressRoot
    v-bind="delegatedProps"
    :class="
      cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-primary/20',
        props.class,
      )
    "
  >
    <ProgressIndicator
      class="h-full w-full flex-1 bg-primary transition-all relative overflow-hidden"
      :class="props.animation ? 'after:content-empty after:absolute after:inset-0 after:bg-gradient-to-r after:from-white/20 after:via-white/60 after:to-white/80 after:animate-shimmer after:translate-x-[-100%]' : ''"
      :style="`transform: translateX(-${100 - (props.modelValue ?? 0)}%);`"
    />
  </ProgressRoot>
</template>
