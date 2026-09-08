<script setup lang="ts">
import type { DropdownMenuSubTriggerProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { ChevronRight } from "@lucide/vue"
import {
  DropdownMenuSubTrigger,
  useForwardProps,
} from "reka-ui"
import { cn } from '~/lib/utils'

const props = defineProps<DropdownMenuSubTriggerProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <DropdownMenuSubTrigger
    v-bind="forwardedProps"
    :class="cn(
      'flex cursor-default select-none items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] outline-none focus:bg-accent data-[state=open]:bg-accent',
      props.class,
    )"
  >
    <slot />
    <ChevronRight class="ml-auto size-3.5" />
  </DropdownMenuSubTrigger>
</template>
