<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import type { SheetVariants } from "."
import { reactiveOmit } from "@vueuse/core"
import { X } from "@lucide/vue"
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from "reka-ui"
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { sheetVariants } from "."

interface SheetContentProps extends DialogContentProps {
  class?: HTMLAttributes["class"]
  side?: SheetVariants["side"]
  overlay?: boolean
  to?: string | HTMLElement
}

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<SheetContentProps>(), {
  overlay: true,
})

const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, "class", "side", "overlay", "to")

const forwarded = useForwardPropsEmits(delegatedProps, emits)

const contentStyle = computed(() => {
  if (!props.to) {
    return
  }

  return {
    position: 'absolute',
  } satisfies HTMLAttributes['style']
})
</script>

<template>
  <DialogPortal :to="props.to">
    <DialogOverlay
      v-if="props.overlay"
      class="fixed inset-0 z-50 bg-black/10 supports-[backdrop-filter:blur(2px)]:backdrop-blur-xs duration-100 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <DialogContent
      :class="cn(sheetVariants({ side }), props.class)"
      :style="contentStyle"
      v-bind="{ ...forwarded, ...$attrs }"
    >
      <slot />

      <DialogClose as-child>
        <Button variant="ghost" size="icon-sm" class="absolute top-3 right-3">
          <X />
          <span class="sr-only">Close</span>
        </Button>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
