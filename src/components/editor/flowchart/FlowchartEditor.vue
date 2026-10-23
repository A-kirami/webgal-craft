<script setup lang="ts">
import { Loader2, TriangleAlert } from '@lucide/vue'

import FlowchartStage from './FlowchartStage.vue'

import type { FlowchartWorkspace } from '~/features/editor/flowchart/useFlowchartWorkspace'

interface Props {
  workspace: FlowchartWorkspace
}

const props = defineProps<Props>()
const { t } = useI18n()

const {
  enableFlowchart,
  errorMessage,
  flowchartEnabled,
  isEnablingFlowchart,
  reload,
  status,
} = props.workspace

let isReloading = $ref(false)

async function handleRetry() {
  if (isReloading) {
    return
  }

  isReloading = true
  try {
    await reload()
  } finally {
    isReloading = false
  }
}

function handleEnable() {
  void enableFlowchart()
}

const isEmptyState = computed(() => !flowchartEnabled.value || status.value !== 'ready')
</script>

<template>
  <section class="flex-1 min-h-0 relative" data-testid="flowchart-editor">
    <FlowchartStage v-if="!isEmptyState" :workspace="props.workspace" />

    <div
      v-else
      class="flex h-full w-full items-center justify-center relative"
      :class="$style.canvas"
    >
      <div class="bg-background/70 inset-0 absolute" aria-hidden="true" />

      <div
        v-if="status === 'loading'"
        class="text-xs px-4 py-3 border rounded-lg bg-background flex gap-2 shadow-sm items-center relative"
        role="status"
      >
        <Loader2 class="size-4 animate-spin" aria-hidden="true" />
        {{ t('edit.flowchart.loading') }}
      </div>

      <div
        v-else-if="status === 'error'"
        class="px-6 py-5 text-center border rounded-lg bg-background flex flex-col gap-1 max-w-[calc(100%-3rem)] w-96 shadow-lg items-center relative"
        data-testid="flowchart-error-state"
        role="alert"
      >
        <TriangleAlert class="text-destructive mb-1 size-5" aria-hidden="true" />
        <h2 class="text-sm font-medium">
          {{ t('edit.flowchart.loadFailedTitle') }}
        </h2>
        <p class="text-xs text-muted-foreground leading-relaxed">
          {{ t('edit.flowchart.loadFailedDescription') }}
        </p>
        <p v-if="errorMessage" class="text-[11px] text-muted-foreground mt-1 px-2 py-1 rounded bg-muted/60 break-all">
          {{ errorMessage }}
        </p>
        <Button class="mt-3" variant="outline" :disabled="isReloading" @click="handleRetry">
          <Loader2 v-if="isReloading" class="animate-spin" />
          {{ t('edit.flowchart.retry') }}
        </Button>
      </div>
      <div
        v-else
        class="px-6 py-5 text-center border rounded-lg bg-background flex flex-col gap-1 max-w-[calc(100%-3rem)] w-80 shadow-lg relative"
        data-testid="flowchart-disabled-overlay"
      >
        <h2 class="text-sm font-medium">
          {{ t('edit.flowchart.disabled.title') }}
        </h2>
        <p class="text-xs text-muted-foreground leading-relaxed">
          {{ t('edit.flowchart.disabled.description') }}
        </p>
        <Button class="mt-3 w-full" :disabled="isEnablingFlowchart" @click="handleEnable">
          <Loader2 v-if="isEnablingFlowchart" class="animate-spin" />
          {{ t('edit.flowchart.disabled.enable') }}
        </Button>
      </div>
    </div>
  </section>
</template>

<style module>
.canvas {
  background-image: radial-gradient(circle, oklch(var(--border) / 65%) 1px, transparent 1px);
  background-size: 20px 20px;
}
</style>
