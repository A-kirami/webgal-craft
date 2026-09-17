<script setup lang="ts">
import { useDrawerDismissLayers } from '~/features/editor/shared/useDrawerDismissLayers'

defineOptions({
  inheritAttrs: false,
})

interface Props {
  /** 抽屉的定位容器，省略时退化为视口右侧的固定抽屉 */
  anchor?: HTMLElement
  /** 打开期间保持可交互的区域选择器；省略时点击任意抽屉外区域都会请求关闭 */
  interactiveRegionSelector?: string
  open: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const dismissLayers = useDrawerDismissLayers({
  interactiveRegionSelector: () => props.interactiveRegionSelector,
  isOpen: () => props.open,
})
</script>

<template>
  <Sheet :open="props.open" :modal="false" @update:open="value => emit('update:open', value)">
    <div
      v-for="layer in dismissLayers"
      :key="layer.key"
      data-testid="editor-drawer-dismiss-layer"
      class="fixed z-40"
      :style="layer.style"
      aria-hidden="true"
      @click="emit('update:open', false)"
    />
    <SheetContent
      :to="props.anchor"
      :overlay="false"
      side="right"
      v-bind="$attrs"
      @open-auto-focus.prevent
      @close-auto-focus.prevent
      @pointer-down-outside.prevent
      @interact-outside.prevent
    >
      <slot />
    </SheetContent>
  </Sheet>
</template>
