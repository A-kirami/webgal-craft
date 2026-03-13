<script setup lang="ts">
import { ResizablePanel } from '~/components/ui/resizable'
</script>

<template>
  <div class="flex flex-col overflow-hidden">
    <EditHeader />
    <ResizablePanelGroup
      auto-save-id="editor-main"
      direction="horizontal"
    >
      <!-- 左栏（预览 + 场景/资源） -->
      <ResizablePanel
        size-unit="px"
        :default-size="380"
        :min-size="280"
        collapsible
      >
        <LeftPanel />
      </ResizablePanel>
      <ResizableHandle />
      <!-- 编辑器区域（标签页+编辑器+命令面板+辅助面板） -->
      <ResizablePanel size-unit="px" :min-size="600">
        <EditorPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
    <EditorStatusBar />
  </div>
</template>
