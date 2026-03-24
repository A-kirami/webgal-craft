<script setup lang="ts">
import { Code, Paintbrush, PanelRight } from 'lucide-vue-next'

import { toggleVariants } from '~/components/ui/toggle'
import { useEditorStore } from '~/stores/editor'
import { usePreferenceStore } from '~/stores/preference'

const preferenceStore = usePreferenceStore()
const editorStore = useEditorStore()
const { t } = useI18n()

const isVisualMode = $computed(() => preferenceStore.editorMode === 'visual')
const canToggleMode = $computed(() => editorStore.canToggleMode)

const canToggleSidebar = $computed(() => editorStore.isCurrentSceneFile)
const modeToggleLabel = $computed(() => isVisualMode ? t('edit.editorMode.textMode') : t('edit.editorMode.visualMode'))
const sidebarToggleLabel = $computed(() => t('edit.editorMode.toggleSidebar'))

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
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            :class="toggleVariants({ size: 'sm' })"
            :aria-label="modeToggleLabel"
            :data-state="isVisualMode ? 'on' : 'off'"
            :disabled="!canToggleMode"
            class="data-[state=on]:bg-transparent disabled:opacity-40 disabled:pointer-events-none"
            @click="handleModeToggle"
          >
            <Paintbrush v-if="isVisualMode" class="size-4" />
            <Code v-else class="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {{ modeToggleLabel }}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger as-child>
          <button
            :class="toggleVariants({ size: 'sm' })"
            :aria-label="sidebarToggleLabel"
            :data-state="preferenceStore.showSidebar ? 'on' : 'off'"
            :disabled="!canToggleSidebar"
            class="disabled:opacity-40 disabled:pointer-events-none"
            @click="handleSidebarToggle"
          >
            <PanelRight class="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {{ sidebarToggleLabel }}
        </TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
</template>
