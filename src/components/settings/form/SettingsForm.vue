<script setup lang="ts">
import { useSettingsForm } from '~/composables/useSettingsForm'
import { resolveI18nLike } from '~/utils/i18n-like'

import type { Store } from 'pinia'
import type { DefinedSettingsSchema, SettingsFieldDef, SettingsSchema } from '~/features/settings/schema'

interface Props {
  definition: DefinedSettingsSchema<SettingsSchema>
  store: Store
}
const props = defineProps<Props>()

const { t } = useI18n()

const form = useSettingsForm({
  store: props.store,
  validationSchema: props.definition.validationSchema,
  fieldNames: props.definition.fieldNames,
  immediateFields: props.definition.immediateFields,
})

const fieldValues = $computed(() => form.values as Record<string, unknown>)

function isFieldVisible(field: SettingsFieldDef) {
  if (!field.visibleWhen) {
    return true
  }

  return Boolean(fieldValues[field.visibleWhen])
}
</script>

<template>
  <form class="space-y-8">
    <section
      v-for="(group, groupKey) in definition.schema"
      :key="groupKey"
      class="space-y-5"
    >
      <h3
        v-if="group.label"
        class="text-xs text-muted-foreground tracking-wide font-medium uppercase"
      >
        {{ resolveI18nLike(group.label, t) }}
      </h3>

      <div class="space-y-5">
        <div
          v-for="(field, fieldKey) in group.fields"
          v-show="isFieldVisible(field)"
          :key="fieldKey"
        >
          <SettingsField
            :name="String(fieldKey)"
            :field="field"
          />
        </div>
      </div>
    </section>
  </form>
</template>
