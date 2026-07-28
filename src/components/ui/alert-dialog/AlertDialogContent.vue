<script setup lang="ts">
import type { AlertDialogContentEmits, AlertDialogContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { AlertDialogContent, AlertDialogOverlay, AlertDialogPortal, useForwardPropsEmits } from "reka-ui"
import { cn } from '~/lib/utils'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<AlertDialogContentProps & { class?: HTMLAttributes["class"] }>()
const emits = defineEmits<AlertDialogContentEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <AlertDialogPortal>
    <AlertDialogOverlay
      class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <AlertDialogContent
      v-bind="{ ...forwarded, ...$attrs }"
      :class="
        cn(
          'fixed left-[calc(50%+(env(safe-area-inset-left)-env(safe-area-inset-right))/2)] top-[calc(50%+(env(safe-area-inset-top)-env(safe-area-inset-bottom))/2)] z-50 grid w-[calc(100vw-env(safe-area-inset-left)-env(safe-area-inset-right)-2rem)] max-w-lg max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg overflow-y-auto duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
          props.class,
        )
      "
    >
      <slot />
    </AlertDialogContent>
  </AlertDialogPortal>
</template>
