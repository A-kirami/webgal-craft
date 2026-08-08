<script setup lang="ts">
import { FileText, X } from '@lucide/vue'

import { getDiagnosticSeverityTextClass } from '~/features/editor/diagnostics/presentation'

import type { DiagnosticSeverity } from '~/features/editor/diagnostics/types'
import type { Tab } from '~/stores/tabs'

interface Props {
  active: boolean
  closeInteractive?: boolean
  diagnosticSeverity?: DiagnosticSeverity
  pathHint?: string
  tab: Tab
}

interface Emits {
  close: []
}

const props = withDefaults(defineProps<Props>(), {
  closeInteractive: true,
})
const emit = defineEmits<Emits>()

function handleCloseClick() {
  if (!props.closeInteractive) {
    return
  }

  emit('close')
}
</script>

<template>
  <div class="flex gap-1.5 items-center">
    <FileText class="shrink-0 size-4" />
    <span
      class="text-13px font-light shrink-0"
      :class="[
        { 'italic': props.tab.isPreview },
        getDiagnosticSeverityTextClass(props.diagnosticSeverity),
      ]"
      :data-diagnostic-severity="props.diagnosticSeverity"
    >
      {{ props.tab.name }}
    </span>
    <span
      v-if="props.pathHint"
      class="text-[11.7px] text-muted-foreground/70 font-light max-w-28 min-w-0 truncate"
      data-editor-tab-path-hint
    >
      ...\{{ props.pathHint }}
    </span>
    <Button
      variant="ghost"
      size="icon"
      class="group/close rounded flex h-5 w-5 items-center justify-center relative hover:bg-muted-foreground/20"
      as="div"
      tabindex="-1"
      data-drag-ignore
      @click.stop="handleCloseClick"
    >
      <div class="flex size-3 items-center justify-center relative">
        <span
          v-if="props.tab.isModified"
          class="rounded-full bg-muted-foreground/50 opacity-100 size-2 transition-opacity absolute group-hover/close:opacity-0"
        />
        <X
          class="size-3 transition-opacity"
          :class="[
            !props.tab.isModified && props.active ? 'opacity-100' :
            props.tab.isModified ? 'opacity-0 group-hover/close:opacity-100' :
            'opacity-0 group-hover:opacity-100'
          ]"
        />
      </div>
      <span class="sr-only">{{ $t('common.close') }}</span>
    </Button>
  </div>
</template>
