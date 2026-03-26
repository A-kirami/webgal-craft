<script setup lang="ts">
import { ResizablePanel } from '~/components/ui/resizable'
import { usePreferenceStore } from '~/stores/preference'

const preferenceStore = usePreferenceStore()
</script>

<template>
  <ResizablePanelGroup auto-save-id="left-panel" direction="vertical" class="h-full">
    <!-- 预览面板（可折叠） -->
    <ResizablePanel size-unit="px" :default-size="245" :min-size="80" collapsible>
      <template #default="{ isCollapsed }">
        <PreviewPanel v-if="!isCollapsed" />
      </template>
    </ResizablePanel>
    <ResizableHandle />
    <!-- 场景/资源面板 -->
    <ResizablePanel size-unit="px" :min-size="240">
      <Tabs ::="preferenceStore.leftPanelView" class="flex flex-col h-full">
        <!-- 顶部横向标签栏：场景 / 资源 -->
        <TabsList class="mx-2 mt-1 p-0.75 shrink-0 h-8">
          <TabsTrigger value="scene" class="flex-1 h-full data-[state=active]:shadow-none">
            {{ $t('edit.scenePanel.scene') }}
          </TabsTrigger>
          <TabsTrigger value="resource" class="flex-1 h-full data-[state=active]:shadow-none">
            {{ $t('edit.scenePanel.resource') }}
          </TabsTrigger>
        </TabsList>
        <div v-show="preferenceStore.leftPanelView === 'scene'" class="flex-1 min-h-0">
          <ScenePanel />
        </div>
        <div v-show="preferenceStore.leftPanelView === 'resource'" class="flex-1 min-h-0">
          <AssetPanel />
        </div>
      </Tabs>
    </ResizablePanel>
  </ResizablePanelGroup>
</template>
