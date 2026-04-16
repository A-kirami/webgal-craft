<script setup lang="ts">
import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaViewport } from 'reka-ui'

import { cn } from '~/lib/utils'

import { useCascadingSubmenuFloating } from './useCascadingSubmenuFloating'

import type { ReferenceElement } from '@floating-ui/vue'
import type { HTMLAttributes } from 'vue'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{
  anchorElement?: ReferenceElement | null
  class?: HTMLAttributes['class']
  open: boolean
  side?: 'left' | 'right'
}>()

const openState = computed(() => props.open && Boolean(props.anchorElement))
const anchor = computed(() => props.anchorElement ?? undefined)
const floating = useCascadingSubmenuFloating({
  anchor,
  open: openState,
  side: computed(() => props.side ?? 'right'),
})
const floatingRef = floating.floatingRef
const isPositioned = floating.isPositioned
const placedAlign = floating.placedAlign
const placedSide = floating.placedSide
const wrapperStyle = floating.wrapperStyle
</script>

<template>
  <Teleport to="body">
    <div
      v-if="openState"
      ref="floatingRef"
      class="z-[60]"
      data-cascading-subpanel=""
      data-reka-popper-content-wrapper=""
      :style="wrapperStyle"
    >
      <div
        v-bind="$attrs"
        data-state="open"
        :data-side="placedSide"
        :data-align="placedAlign"
        :class="cn(
          'overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          props.class,
        )"
        :style="{
          animation: !isPositioned ? 'none' : undefined,
          minWidth: 'max(8rem, var(--reka-popper-anchor-width))',
        }"
      >
        <ScrollAreaRoot
          data-cascading-subpanel-scroll-area=""
          type="auto"
          class="w-full relative overflow-hidden"
        >
          <ScrollAreaViewport
            data-cascading-subpanel-scroll-viewport=""
            class="rounded-[inherit] w-full"
            :style="{
              maxHeight: 'max(0px, calc(var(--reka-popper-available-height) - 2px))',
            }"
          >
            <div class="p-1">
              <slot :placed-side="placedSide" />
            </div>
          </ScrollAreaViewport>
          <ScrollBar />
          <ScrollAreaCorner />
        </ScrollAreaRoot>
      </div>
    </div>
  </Teleport>
</template>
