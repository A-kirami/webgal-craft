<script setup lang="ts">
import type { ContextMenuItemEmits, ContextMenuItemProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import {
  ContextMenuItem,
  useForwardPropsEmits,
} from "reka-ui"
import { cn } from '~/lib/utils'

const props = defineProps<ContextMenuItemProps & { class?: HTMLAttributes["class"], inset?: boolean, variant?: "default" | "destructive" }>()
const emits = defineEmits<ContextMenuItemEmits>()

const delegatedProps = reactiveOmit(props, "class", "variant")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <ContextMenuItem
    v-bind="forwarded"
    :class="cn(
      'relative flex cursor-default select-none items-center gap-2 rounded-sm px-1.5 py-1 text-[13px] outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-3.5 [&>svg]:shrink-0',
      inset && 'pl-7',
      variant === 'destructive' && 'text-destructive focus:bg-destructive focus:text-destructive-foreground',
      props.class,
    )"
  >
    <slot />
  </ContextMenuItem>
</template>
