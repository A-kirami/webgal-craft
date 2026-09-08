<script setup lang="ts">
import type { DropdownMenuItemProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { DropdownMenuItem, useForwardProps } from "reka-ui"
import { cn } from '~/lib/utils'

const props = defineProps<DropdownMenuItemProps & { class?: HTMLAttributes["class"], inset?: boolean, variant?: "default" | "destructive" }>()

const delegatedProps = reactiveOmit(props, "class", "variant")

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <DropdownMenuItem
    v-bind="forwardedProps"
    :class="cn(
      'relative flex cursor-default select-none items-center gap-1.5 rounded-sm px-1.5 py-1 text-[13px] outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-3.5 [&>svg]:shrink-0',
      inset && 'pl-7',
      variant === 'destructive' && 'text-destructive focus:bg-destructive focus:text-destructive-foreground',
      props.class,
    )"
  >
    <slot />
  </DropdownMenuItem>
</template>
