<script setup lang="ts">
import { resolveI18nLike } from '~/utils/i18n-like'

import type { NumberFieldDef } from '~/features/settings/schema'

interface Props {
  field: NumberFieldDef
  value?: number
  handleChange: (value: number) => void
  componentField?: Record<string, unknown>
}

const props = defineProps<Props>()
const { t } = useI18n()

function handleNumberChange(nextValue: string | number) {
  const numberValue = typeof nextValue === 'string'
    ? (nextValue === '' ? undefined : Number(nextValue))
    : nextValue

  if (numberValue === undefined || Number.isNaN(numberValue)) {
    return
  }

  props.handleChange(numberValue)
}
</script>

<template>
  <FormItem class="flex flex-row gap-4 max-w-120 items-center justify-between space-y-0">
    <div class="flex flex-col gap-1">
      <FormLabel class="flex gap-1">
        {{ resolveI18nLike(field.label, t) }}
        <ExperimentalFeatureTooltip v-if="field.experimental" />
      </FormLabel>
      <FormDescription v-if="field.description" class="text-xs">
        {{ resolveI18nLike(field.description, t) }}
      </FormDescription>
    </div>
    <div class="flex flex-col gap-1 items-end">
      <FormControl>
        <NumberField
          :model-value="value"
          :min="field.min"
          :max="field.max"
          :invert-wheel-change="true"
          @update:model-value="handleNumberChange"
        >
          <NumberFieldContent class="w-26">
            <NumberFieldInput class="h-8 shadow-none" />
            <NumberFieldIncrement class="p-2" />
            <NumberFieldDecrement class="p-2" />
          </NumberFieldContent>
        </NumberField>
      </FormControl>
      <FormMessage />
    </div>
  </FormItem>
</template>
