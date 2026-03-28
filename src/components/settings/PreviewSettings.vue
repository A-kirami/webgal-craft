<script setup lang="ts">
import { previewSettingsDefinition } from '~/features/settings/preview-settings'
import { usePreviewSettingsStore } from '~/stores/preview-settings'

import SettingsForm from './form/SettingsForm.vue'

const previewSettingsStore = usePreviewSettingsStore()
</script>

<template>
  <SettingsForm
    :definition="previewSettingsDefinition"
    :store="previewSettingsStore"
  />
</template>
