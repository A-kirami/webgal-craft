<script setup lang="ts">
import { ResizablePanel } from '~/components/ui/resizable'

const show = defineModel<boolean>('show', { default: false })

defineOptions({ inheritAttrs: false })

const sidebarRef = $(useTemplateRef<InstanceType<typeof ResizablePanel>>('sidebar'))

// store → 面板：外部切换时同步面板状态
watch(show, (val) => {
  if (!sidebarRef) {
    return
  }
  if (val && sidebarRef.isCollapsed) {
    sidebarRef.expand()
  } else if (!val && !sidebarRef.isCollapsed) {
    sidebarRef.collapse()
  }
})

// 初始挂载时同步：default-size 为展开态，若 show 初始为 false 需立即折叠
onMounted(() => {
  if (!show.value) {
    nextTick(() => sidebarRef?.collapse())
  }
})

// 面板 → store：拖拽折叠/展开时同步回外部状态
function handleCollapse() {
  if (show.value) {
    show.value = false
  }
}

function handleExpand() {
  if (!show.value) {
    show.value = true
  }
}
</script>

<template>
  <ResizablePanelGroup auto-save-id="editor-sidebar" direction="horizontal" class="overflow-hidden">
    <ResizablePanel size-unit="px" :min-size="300">
      <slot />
    </ResizablePanel>
    <ResizableHandle />
    <ResizablePanel
      ref="sidebar"
      collapsible
      size-unit="px"
      :default-size="200"
      :min-size="160"
      @collapse="handleCollapse"
      @expand="handleExpand"
    >
      <slot name="sidebar" />
    </ResizablePanel>
  </ResizablePanelGroup>
</template>
