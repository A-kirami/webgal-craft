<script setup lang="ts">
import { Code, Paintbrush, PanelRight } from 'lucide-vue-next'

import { toggleVariants } from '~/components/ui/toggle'

const preferenceStore = usePreferenceStore()
const editorStore = useEditorStore()

const isVisualMode = $computed(() => preferenceStore.editorMode === 'visual')
const canToggleMode = $computed(() => editorStore.canToggleMode)

// 辅助面板按钮：当前文件为场景文件时可切换
const canToggleSidebar = $computed(() => editorStore.isCurrentSceneFile)

function handleModeToggle() {
  if (!canToggleMode || !editorStore.currentState) {
    return
  }
  const mode = isVisualMode ? 'text' : 'visual'
  editorStore.switchEditorMode(mode)
}

function handleSidebarToggle() {
  preferenceStore.showSidebar = !preferenceStore.showSidebar
}
</script>

<template>
  <TooltipProvider>
    <div class="flex gap-0.5 items-center">
      <!-- 编辑器模式切换 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            :class="toggleVariants({ size: 'sm' })"
            :data-state="isVisualMode ? 'on' : 'off'"
            :disabled="!canToggleMode"
            class="disabled:opacity-40 disabled:pointer-events-none"
            @click="handleModeToggle"
          >
            <Paintbrush v-if="isVisualMode" class="size-4" />
            <Code v-else class="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {{ isVisualMode ? $t('edit.editorMode.textMode') : $t('edit.editorMode.visualMode') }}
        </TooltipContent>
      </Tooltip>

      <!-- 辅助面板开关 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            :class="toggleVariants({ size: 'sm' })"
            :data-state="preferenceStore.showSidebar ? 'on' : 'off'"
            :disabled="!canToggleSidebar"
            class="disabled:opacity-40 disabled:pointer-events-none"
            @click="handleSidebarToggle"
          >
            <PanelRight class="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {{ $t('edit.editorMode.toggleSidebar') }}
        </TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
</template>
