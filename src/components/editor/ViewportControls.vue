<script setup lang="ts">
import { Maximize, Minus, Plus } from '@lucide/vue'

interface Props {
  zoomRatio: number
}

interface Emits {
  fitToView: []
  zoomIn: []
  zoomOut: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const zoomPercent = $computed(() => `${Math.round(props.zoomRatio * 100)}%`)
const buttonClass = 'size-6 text-muted-foreground hover:text-foreground'
</script>

<template>
  <TooltipProvider>
    <div
      data-testid="viewport-controls"
      class="flex gap-1 items-center"
    >
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            :class="buttonClass"
            @click="emit('zoomOut')"
          >
            <Minus class="size-3.5" />
            <span class="sr-only">{{ $t('edit.previewPanel.zoomOut') }}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{{ $t('edit.previewPanel.zoomOut') }}</p>
        </TooltipContent>
      </Tooltip>

      <output
        class="text-xs font-medium px-1.5 text-center flex h-6 min-w-12 pointer-events-none select-none items-center justify-center tabular-nums"
        :aria-label="$t('edit.previewPanel.zoomLevel')"
      >
        {{ zoomPercent }}
      </output>

      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            :class="buttonClass"
            @click="emit('zoomIn')"
          >
            <Plus class="size-3.5" />
            <span class="sr-only">{{ $t('edit.previewPanel.zoomIn') }}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{{ $t('edit.previewPanel.zoomIn') }}</p>
        </TooltipContent>
      </Tooltip>

      <div class="mx-0.5 bg-border h-4 w-px" />

      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            :class="[buttonClass, 'ml-0.5']"
            @click="emit('fitToView')"
          >
            <Maximize class="size-3.5" />
            <span class="sr-only">{{ $t('edit.previewPanel.fitToView') }}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{{ $t('edit.previewPanel.fitToView') }}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
</template>
