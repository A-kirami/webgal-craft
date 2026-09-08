<script setup lang="ts">
import type { SelectItemProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { Check } from "@lucide/vue"
import {
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  useForwardProps,
} from "reka-ui"
import { cn } from '~/lib/utils'

const props = defineProps<SelectItemProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <SelectItem
    v-bind="forwardedProps"
    :class="
      cn(
        'relative flex w-full cursor-default select-none items-center gap-1.5 rounded-sm py-1 pr-8 pl-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*=size-])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0',
        props.class,
      )
    "
  >
    <span class="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
      <SelectItemIndicator>
        <Check />
      </SelectItemIndicator>
    </span>

    <SelectItemText>
      <slot />
    </SelectItemText>
  </SelectItem>
</template>
