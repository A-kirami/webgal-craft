<script setup lang="ts">
import { ResizablePanel } from '~/components/ui/resizable'
</script>

<template>
  <div class="flex flex-col overflow-hidden">
    <EditHeader />
    <ResizablePanelGroup
      direction="horizontal"
    >
      <ResizablePanel :default-size="15" :min-size="5" :collapsible="true">
        <ScenePanel />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel :default-size="45" :min-size="20">
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel :default-size="65" :min-size="20" :collapsible="true">
            <template #default="{ isCollapsed }">
              <PreviewPanel v-if="!isCollapsed" />
            </template>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel :default-size="35" :min-size="20">
            <AssetPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel :default-size="40" :min-size="20">
        <EditorPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</template>
