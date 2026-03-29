<script setup lang="ts">
import { resolveI18nLike } from '~/utils/i18n-like'

import type { SwitchFieldDef } from '~/features/settings/schema'

interface Props {
  field: SwitchFieldDef
  value?: boolean
  handleChange: (value: boolean) => void
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
    <div class="flex flex-col gap-1 items-end">
      <FormControl>
        <Switch
          :model-value="Boolean(value)"
          @update:model-value="handleChange"
        />
      </FormControl>
      <FormMessage />
    </div>
  </FormItem>
</template>
