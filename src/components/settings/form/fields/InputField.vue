<script setup lang="ts">
import { resolveI18nLike } from '~/utils/i18n-like'

import type { InputFieldDef } from '~/features/settings/schema'

interface Props {
  field: InputFieldDef
  value?: string
  handleChange?: (value: string) => void
  componentField?: object
}

defineProps<Props>()
const { t } = useI18n()
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
        <Input
          v-bind="componentField"
          type="text"
          class="text-xs h-8 w-64 shadow-none"
          :placeholder="field.placeholder ? resolveI18nLike(field.placeholder, t) : undefined"
        />
      </FormControl>
      <FormMessage />
    </div>
  </FormItem>
</template>
