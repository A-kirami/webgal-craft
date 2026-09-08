<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
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

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<DialogContentProps & { class?: HTMLAttributes["class"] }>()
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/10 supports-[backdrop-filter:blur(2px)]:backdrop-blur-xs duration-100 p-4 sm:p-8 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    >
      <DialogContent
        :class="
          cn(
            'relative z-50 grid w-full max-w-lg gap-4 ring-1 ring-foreground/10 bg-background p-6 duration-200 sm:rounded-lg md:w-full',
            props.class,
          )
        "
        v-bind="{ ...forwarded, ...$attrs }"
        @pointer-down-outside="(event) => {
          const originalEvent = event.detail.originalEvent;
          const target = originalEvent.target as HTMLElement;
          if (originalEvent.offsetX > target.clientWidth || originalEvent.offsetY > target.clientHeight) {
            event.preventDefault();
          }
        }"
      >
        <slot />

        <DialogClose as-child>
          <Button variant="ghost" size="icon-sm" class="absolute top-4 right-4">
            <X />
            <span class="sr-only">Close</span>
          </Button>
        </DialogClose>
      </DialogContent>
    </DialogOverlay>
  </DialogPortal>
</template>
