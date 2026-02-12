<script setup lang="ts">
import { ChromePicker } from 'vue-color'

import { cn } from '~/lib/utils'

import type { HTMLAttributes } from 'vue'
import 'vue-color/style.css'

interface Props {
  class?: HTMLAttributes['class']
  disableAlpha?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disableAlpha: false,
})

const color = defineModel<string>({ default: '#000000' })
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <button :class="cn('inline-flex items-center justify-center w-12 h-6 p-2px bg-transparent border border-border rounded-md transition-colors', props.class)" type="button">
        <span class="rounded-sm h-full w-full block" :style="{ backgroundColor: color }" />
      </button>
    </PopoverTrigger>
    <PopoverContent class="p-0 rounded-md w-auto shadow-md overflow-hidden" :side-offset="8">
      <ChromePicker ::="color" :disable-alpha="disableAlpha" class="[&_svg]:align-baseline [&_svg]:inline" />
    </PopoverContent>
  </Popover>
</template>
