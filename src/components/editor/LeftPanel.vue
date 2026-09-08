<script setup lang="ts">
import { ResizablePanel } from '~/components/ui/resizable'
import { readResizablePanelCollapsed } from '~/features/editor/shared/resizable-panel'
import { usePreferenceStore } from '~/stores/preference'

const preferenceStore = usePreferenceStore()
const previewPanelRef = $(useTemplateRef<InstanceType<typeof ResizablePanel>>('previewPanel'))

function syncPreviewPanel() {
  if (!previewPanelRef) {
    return
  }

  const isPreviewPanelCollapsed = readResizablePanelCollapsed(previewPanelRef)

  if (
    preferenceStore.showPreviewPanel
    && isPreviewPanelCollapsed
    && typeof previewPanelRef.expand === 'function'
  ) {
    previewPanelRef.expand()
    return
  }

  if (
    !preferenceStore.showPreviewPanel
    && !isPreviewPanelCollapsed
    && typeof previewPanelRef.collapse === 'function'
  ) {
    previewPanelRef.collapse()
  }
}

watch(() => preferenceStore.showPreviewPanel, () => {
  syncPreviewPanel()
})

onMounted(() => {
  nextTick(() => {
    syncPreviewPanel()
  })
})

function handlePreviewCollapse() {
  if (preferenceStore.showPreviewPanel) {
    preferenceStore.showPreviewPanel = false
  }
}

function handlePreviewExpand() {
  if (!preferenceStore.showPreviewPanel) {
    preferenceStore.showPreviewPanel = true
  }
}
</script>

<template>
  <ResizablePanelGroup auto-save-id="left-panel" direction="vertical" class="h-full">
    <!-- 预览面板（可折叠） -->
    <ResizablePanel
      ref="previewPanel"
      size-unit="px"
      :default-size="300"
      :min-size="150"
      collapsible
      @collapse="handlePreviewCollapse"
      @expand="handlePreviewExpand"
    >
      <template #default="{ isCollapsed }">
        <PreviewPanel v-if="preferenceStore.showPreviewPanel && !isCollapsed" />
      </template>
    </ResizablePanel>
    <ResizableHandle />
    <!-- 场景/资源面板 -->
    <ResizablePanel size-unit="px" :min-size="240">
      <Tabs ::="preferenceStore.leftPanelView" class="h-full">
        <!-- 顶部横向标签栏：场景 / 资源 -->
        <TabsList class="p-0 border-b border-border rounded-none bg-transparent shrink-0 w-full">
          <TabsTrigger
            value="scene"
            class="rounded-none h-full hover:text-foreground after:rounded-full data-[state=active]:bg-transparent after:h-0.5 after:content-empty after:transition-colors after:inset-x-3 after:bottom-0 after:absolute data-[state=active]:after:bg-foreground"
          >
            {{ $t('edit.scenePanel.scene') }}
          </TabsTrigger>
          <TabsTrigger
            value="resource"
            class="rounded-none h-full hover:text-foreground after:rounded-full data-[state=active]:bg-transparent after:h-0.5 after:content-empty after:transition-colors after:inset-x-3 after:bottom-0 after:absolute data-[state=active]:after:bg-foreground"
          >
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
