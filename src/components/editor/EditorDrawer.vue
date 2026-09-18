<script setup lang="ts">
import { useDrawerDismissLayers } from '~/features/editor/shared/useDrawerDismissLayers'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'

defineOptions({
  inheritAttrs: false,
})

interface Props {
  /** 抽屉的定位容器，省略时退化为视口右侧的固定抽屉 */
  anchor?: HTMLElement
  /** 打开期间保持可交互的区域选择器；省略时点击任意抽屉外区域都会请求关闭 */
  interactiveRegionSelector?: string
  open: boolean
  /** 打开期间由整个抽屉表面（含头部、页脚与内置关闭按钮）接管的快捷键上下文标识 */
  panelFocus: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const contentRef = useTemplateRef<InstanceType<typeof SheetContent>>('contentRef')

const dismissLayers = useDrawerDismissLayers({
  interactiveRegionSelector: () => props.interactiveRegionSelector,
  isOpen: () => props.open,
})

// 上下文挂在抽屉表面上而不是某个子面板上：焦点落在头部、页脚或关闭按钮时快捷键同样成立。
// active 必须跟随 open：Presence 会等退场动画结束才卸载内容，这段时间 target 仍在、焦点也可能仍留在
// 抽屉内，只靠 target 判定会让已关闭的抽屉继续占用快捷键上下文并覆盖其他编辑器
useShortcutContext({
  panelFocus: () => props.panelFocus,
}, {
  active: () => props.open,
  target: () => contentRef.value?.contentElement,
  trackFocus: true,
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
      ref="contentRef"
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
