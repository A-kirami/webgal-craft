<script setup lang="ts">
import { cn } from '~/lib/utils'
import { buttonVariants } from '~/components/ui/button'
import { AlertDialogAction, type AlertDialogActionProps } from 'reka-ui'
import { computed, type HTMLAttributes } from 'vue'
import type {  ButtonVariants } from '~/components/ui/button'

const props = defineProps<AlertDialogActionProps & { class?: HTMLAttributes['class'], variant?: ButtonVariants['variant'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})
</script>

<template>
  <AlertDialogAction v-bind="delegatedProps" :class="cn(buttonVariants({ variant }), props.class)">
    <slot />
  </AlertDialogAction>
</template>
