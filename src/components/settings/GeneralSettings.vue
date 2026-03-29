<script setup lang="ts">
import { generalSettingsDefinition } from '~/features/settings/general-settings'
import { useGeneralSettingsStore } from '~/stores/general-settings'

import SettingsForm from './form/SettingsForm.vue'

const { t } = useI18n()
const generalSettingsStore = useGeneralSettingsStore()
const themeFieldName = 'general-theme'

const themeOptions = $computed(() => [
  { value: 'light', label: t('settings.general.theme.options.light') },
  { value: 'dark', label: t('settings.general.theme.options.dark') },
  { value: 'system', label: t('settings.general.followSystem') },
] as const)
</script>

<template>
  <div class="space-y-5">
    <section class="space-y-2">
      <h3 class="text-sm font-medium">
        {{ $t('settings.general.theme.label') }}
      </h3>

      <div
        :aria-label="$t('settings.general.theme.label')"
        class="flex flex-wrap gap-8"
        role="radiogroup"
      >
        <label
          v-for="themeOp in themeOptions"
          :key="themeOp.value"
          class="outline-none rounded-md flex flex-col cursor-pointer items-stretch"
        >
          <input
            v-model="generalSettingsStore.theme"
            type="radio"
            :name="themeFieldName"
            :value="themeOp.value"
            class="peer sr-only"
          >
          <ThemeStyleMap :theme="themeOp.value" class="transition-colors peer-checked:border-primary" />
          <span class="text-xs text-muted-foreground font-normal p-2 text-center w-full block peer-checked:text-foreground">{{ themeOp.label }}</span>
        </label>
      </div>
    </section>

    <SettingsForm
      :definition="generalSettingsDefinition"
      :store="generalSettingsStore"
    />
  </div>
</template>
