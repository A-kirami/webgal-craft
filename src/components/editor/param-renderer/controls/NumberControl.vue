<script setup lang="ts">
import { normalizeFieldStringValue, resolveFieldModelStringValue, resolvePanelSliderEmitValue } from '~/features/editor/statement-editor/field-utils'
import { cn } from '~/lib/utils'

import type { HTMLAttributes } from 'vue'

interface Props {
  autoWidthByContent?: boolean
  class?: HTMLAttributes['class']
  id?: string
  max?: number
  min?: number
  unitLabel?: string
  value: string | number | boolean
  variant?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  commitSlider: [event: Event]
  updateValue: [value: string]
}>()

function emitNormalizedValue(value: unknown) {
  emit('updateValue', normalizeFieldStringValue(value))
}

function handlePanelSliderUpdate(values?: number[]) {
  const nextValue = resolvePanelSliderEmitValue(values)
  if (nextValue === undefined) {
    return
  }
  emit('updateValue', nextValue)
}
</script>

<template>
  <div v-if="variant === 'slider-input'" :class="cn('flex gap-2 items-center', props.class)">
    <Slider
      class="grow"
      :model-value="[Number(value) || 0]"
      :min="min ?? 0"
      :max="max ?? 100"
      @update:model-value="handlePanelSliderUpdate"
    />
    <Input
      :id="id"
      type="number"
      class="text-xs px-2 py-1 h-7 w-12 shadow-none"
      inputmode="decimal"
      :model-value="String(value ?? '')"
      @blur="$emit('commitSlider', $event)"
      @keydown.enter="$emit('commitSlider', $event)"
    />
  </div>

  <InputGroup
    v-else-if="variant === 'input-with-unit'"
    :class="cn('h-6 w-24 shadow-none group-data-[surface=panel]:h-7 group-data-[surface=panel]:w-auto', props.class)"
  >
    <InputGroupInput
      :id="id"
      type="number"
      :min="min"
      :max="max"
      :model-value="resolveFieldModelStringValue(value)"
      class="text-xs px-2.5 pr-1 h-6 shadow-none group-data-[surface=panel]:px-3 group-data-[surface=panel]:h-7"
      @update:model-value="emitNormalizedValue"
    />
    <InputGroupAddon align="inline-end" class="text-xs">
      {{ unitLabel }}
    </InputGroupAddon>
  </InputGroup>

  <Input
    v-else
    :id="id"
    type="number"
    :min="min"
    :max="max"
    :model-value="resolveFieldModelStringValue(value)"
    :class="cn(
      'text-xs h-6 px-2.5 w-16 shadow-none group-data-[surface=panel]:h-7 group-data-[surface=panel]:px-3 group-data-[surface=panel]:w-auto',
      autoWidthByContent && 'field-sizing-content w-auto max-w-full min-w-16',
      props.class,
    )"
    @update:model-value="emitNormalizedValue"
  />
</template>
