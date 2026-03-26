<script setup lang="ts">
import { CUSTOM_CONTENT } from '~/features/editor/command-registry/schema'
import { normalizeFieldStringValue } from '~/features/editor/statement-editor/field-utils'
import { cn } from '~/lib/utils'

import type { ParamSelectOptionItem } from './types'
import type { HTMLAttributes } from 'vue'

interface Props {
  id?: string
  customizable?: boolean
  customOptionLabel: string
  groupClass?: HTMLAttributes['class']
  itemClass?: HTMLAttributes['class']
  modelValue?: string
  options: ParamSelectOptionItem[]
  selectValue?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  updateSelect: [value: string]
  updateValue: [value: string]
}>()

const controlValue = $computed(() => props.modelValue ?? props.selectValue ?? '')
const mergedOptions = $computed(() => {
  if (!props.customizable) {
    return props.options
  }
  return [...props.options, {
    value: CUSTOM_CONTENT,
    label: props.customOptionLabel,
  }]
})

function emitNormalizedSelect(value: unknown) {
  const normalized = normalizeFieldStringValue(value)
  emit('updateSelect', normalized)
  emit('updateValue', normalized)
}
</script>

<template>
  <ToggleGroup
    :id="id"
    type="single"
    variant="default"
    :model-value="controlValue"
    :class="cn('border border-border/60 rounded-md bg-muted/20 inline-flex w-auto p-0.5 gap-0.5 h-6 group-data-[surface=panel]:flex group-data-[surface=panel]:w-full group-data-[surface=panel]:h-7', groupClass)"
    @update:model-value="emitNormalizedSelect"
  >
    <ToggleGroupItem
      v-for="opt in mergedOptions"
      :key="opt.value"
      :value="opt.value"
      :class="cn('text-xs leading-none px-2 border-0 rounded-sm gap-1 h-4.5 justify-center min-w-0 flex-1 shadow-none data-[state=on]:text-accent-foreground data-[state=on]:bg-accent hover:bg-muted/60 group-data-[surface=panel]:h-5.5 ', itemClass)"
    >
      <span v-if="opt.iconClass" :class="opt.iconClass" class="shrink-0 size-3.5" />
      <span class="truncate">
        {{ opt.label }}
      </span>
    </ToggleGroupItem>
  </ToggleGroup>
</template>
