<script setup lang="ts">
import type { StyleValue } from 'vue'
import type { DiagnosticSeverity } from '~/features/editor/diagnostics/types'
import type { Tab } from '~/stores/tabs'

defineOptions({
  inheritAttrs: false,
})

interface Props {
  active: boolean
  closeInteractive?: boolean
  diagnosticSeverity?: DiagnosticSeverity
  itemStyle?: StyleValue
  pathHint?: string
  sorting?: boolean
  tab: Tab
  tintClass: string
}

interface Emits {
  close: []
}

const props = withDefaults(defineProps<Props>(), {
  closeInteractive: true,
  sorting: false,
})
const emit = defineEmits<Emits>()
const attrs = useAttrs()
</script>

<template>
  <Button
    variant="ghost"
    class="group pl-3 pr-1 border-r rounded-none h-full relative overflow-hidden touch-none"
    :class="[
      props.active ? 'bg-muted hover:bg-muted before:bg-primary' : 'bg-background hover:bg-background',
      props.sorting ? 'cursor-grabbing' : 'cursor-default',
    ]"
    :style="props.itemStyle"
    :title="props.tab.path"
    un-before="h-0.5 w-full absolute top-0 inset-x-0 content-empty z-20"
    v-bind="attrs"
  >
    <span
      aria-hidden="true"
      class="bg-muted/50 pointer-events-none transition-opacity inset-0 absolute"
      :class="props.tintClass"
      data-editor-tab-tint="true"
    />
    <span class="flex min-w-0 relative z-10">
      <EditorTabContent
        :tab="props.tab"
        :active="props.active"
        :close-interactive="props.closeInteractive"
        :diagnostic-severity="props.diagnosticSeverity"
        :path-hint="props.pathHint"
        @close="emit('close')"
      />
    </span>
  </Button>
</template>
