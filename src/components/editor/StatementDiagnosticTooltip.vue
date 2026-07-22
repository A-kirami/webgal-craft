<script setup lang="ts">
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip'
import { getEditorDiagnosticMessage } from '~/features/editor/diagnostics/presentation'
import { selectHighestDiagnosticSeverity } from '~/features/editor/diagnostics/types'
import { cn } from '~/lib/utils'

import type { HTMLAttributes } from 'vue'
import type { EditorFieldDiagnostic } from '~/features/editor/diagnostics/types'

const props = defineProps<{
  class?: HTMLAttributes['class']
  diagnostics: readonly EditorFieldDiagnostic[]
  tooltip?: string
}>()

const { t } = useI18n()

const severity = $computed(() => selectHighestDiagnosticSeverity(props.diagnostics))
const hasTooltip = $computed(() => props.diagnostics.length > 0 || !!props.tooltip)

function diagnosticMessage(diagnostic: EditorFieldDiagnostic): string {
  return getEditorDiagnosticMessage(diagnostic, t)
}

const contentClass = $computed(() => cn(
  'px-1.5 py-0.5 border max-w-100 text-xs leading-relaxed shadow-md',
  severity === 'error' && 'bg-destructive text-destructive-foreground border-destructive/60',
  severity === 'warning' && 'text-yellow-950 bg-yellow-100 border-yellow-400 dark:text-yellow-50 dark:bg-yellow-950 dark:border-yellow-700',
  severity === 'info' && 'text-blue-950 bg-blue-100 border-blue-400 dark:text-blue-50 dark:bg-blue-950 dark:border-blue-700',
  severity === 'hint' && 'text-foreground bg-muted border-border',
))
</script>

<template>
  <TooltipProvider :delay-duration="250" :skip-delay-duration="0">
    <Tooltip :disabled="!hasTooltip">
      <TooltipTrigger as-child>
        <div
          :class="cn('group/statement-diagnostic inline-flex max-w-full min-w-0', props.class)"
          :data-severity="severity"
          data-statement-diagnostic-trigger
        >
          <slot />
        </div>
      </TooltipTrigger>
      <TooltipContent v-if="hasTooltip" side="top" :class="contentClass" data-statement-diagnostic-tooltip>
        <p v-if="props.tooltip" role="note">
          {{ props.tooltip }}
        </p>
        <ul v-if="props.diagnostics.length > 0" class="flex flex-col gap-1" :class="props.tooltip && 'mt-1'">
          <li v-for="(diagnostic, index) in props.diagnostics" :key="`${diagnostic.code}:${diagnostic.source}:${index}`">
            {{ diagnosticMessage(diagnostic) }}
          </li>
        </ul>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
