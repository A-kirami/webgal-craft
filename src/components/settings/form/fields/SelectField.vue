<script setup lang="ts">
import { resolveI18nLike } from '~/utils/i18n-like'

import type { AcceptableValue } from 'reka-ui'
import type { SelectFieldDef } from '~/features/settings/schema'

interface Props {
  field: SelectFieldDef
  value?: AcceptableValue
  handleChange: (value: AcceptableValue) => void
  componentField?: Record<string, unknown>
}

defineProps<Props>()
const { t } = useI18n()
</script>

<template>
  <FormItem class="flex flex-row gap-2 max-w-120 items-center justify-between space-y-0">
    <div class="flex flex-col gap-1">
      <FormLabel class="flex gap-1">
        {{ resolveI18nLike(field.label, t) }}
        <ExperimentalFeatureTooltip v-if="field.experimental" />
      </FormLabel>
      <FormDescription v-if="field.description" class="text-xs">
        {{ resolveI18nLike(field.description, t) }}
      </FormDescription>
    </div>
    <Select :model-value="value" @update:model-value="handleChange">
      <FormControl>
        <SelectTrigger class="text-xs h-8 min-w-28 w-40 shadow-none">
          <SelectValue :placeholder="field.placeholder ? resolveI18nLike(field.placeholder, t) : undefined" />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        <SelectItem
          v-for="option in field.options"
          :key="option.value"
          :value="option.value"
        >
          {{ resolveI18nLike(option.label, t) }}
        </SelectItem>
      </SelectContent>
    </Select>
  </FormItem>
</template>
