<script setup lang="ts">
import { normalizeFieldStringValue } from '~/features/editor/statement-editor/field-utils'
import { cn } from '~/lib/utils'

import type { ParamSelectOptionItem } from './types'
import type { HTMLAttributes } from 'vue'

interface Props {
  controlClass?: HTMLAttributes['class']
  inputId: string
  options: ParamSelectOptionItem[]
  selectValue: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  updateSelect: [value: string]
}>()

function emitSelect(value: unknown) {
  emit('updateSelect', normalizeFieldStringValue(value))
}
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <ToggleGroup
      :id="props.inputId"
      type="single"
      :model-value="props.selectValue"
      :class="cn('border border-border/60 rounded-md bg-muted/20 flex w-full p-0.5 gap-0.5 h-7', props.controlClass)"
      :aria-label="$t('edit.visualEditor.params.position')"
      @update:model-value="emitSelect"
    >
      <Tooltip
        v-for="option in props.options"
        :key="option.value"
      >
        <TooltipTrigger as-child>
          <ToggleGroupItem
            :value="option.value"
            :aria-label="option.label"
            :class="cn('border-0 rounded-sm h-6 min-w-0 flex-1 p-0 text-muted-foreground/40 shadow-none justify-center hover:bg-muted/60 hover:text-muted-foreground', option.value === props.selectValue && 'bg-accent text-foreground')"
          >
            <svg
              aria-hidden="true"
              class="size-5"
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
            >
              <path
                fill="currentColor"
                d="M13.75 7h-3.5C9.04 7 8.11 8.07 8.27 9.26L9.82 20.7c.1.74.74 1.3 1.49 1.3h1.38a1.5 1.5 0 0 0 1.49-1.3l1.56-11.44C15.89 8.07 14.96 7 13.75 7"
              />
              <circle
                cx="12"
                cy="4"
                r="2"
                fill="currentColor"
              />
            </svg>
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent side="top">
          {{ option.label }}
        </TooltipContent>
      </Tooltip>
    </ToggleGroup>
  </TooltipProvider>
</template>
