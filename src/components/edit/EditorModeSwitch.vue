<script setup lang="tsx">
import { Code, Paintbrush } from 'lucide-vue-next'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip'
import { useEditorStore } from '~/stores/editor'
import { usePreferenceStore } from '~/stores/preference'

import type { LucideIcon } from 'lucide-vue-next'

const preferenceStore = usePreferenceStore()
const editorStore = useEditorStore()

const handleModeChange = (mode?: 'text' | 'visual') => {
  if (!editorStore.currentState) {
    return
  }
  mode ??= preferenceStore.editorMode === 'text' ? 'visual' : 'text'
  editorStore.toggleTextualMode(mode)
  preferenceStore.editorMode = mode
}

const ModeButton = ({ mode, icon: Icon, tooltip }: { mode: 'text' | 'visual', icon: LucideIcon, tooltip: string }) => {
  const isActive = preferenceStore.editorMode === mode

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          class={[
            'flex items-center justify-center w-8 rounded transition-all h-full',
            isActive
              ? 'bg-white text-blue-700 dark:bg-gray-800 dark:text-blue-300'
              : 'text-white hover:bg-white/10',
          ]}
        >
          <Icon
            class={[
              'h-4 w-4',
              isActive ? 'text-blue-500' : 'text-white',
            ]}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  )
}
</script>

<template>
  <TooltipProvider>
    <div class="p-0.5 rounded-md bg-blue-500 flex h-6 cursor-pointer" @click="handleModeChange()">
      <ModeButton :mode="'text'" :icon="Code" :tooltip="$t('edit.editorMode.textMode')" />
      <ModeButton :mode="'visual'" :icon="Paintbrush" :tooltip="$t('edit.editorMode.visualMode')" />
    </div>
  </TooltipProvider>
</template>
