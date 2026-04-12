<script setup lang="ts">
import { previewSettingsDefinition } from '~/features/settings/preview-settings'
import { usePreviewSettingsStore } from '~/stores/preview-settings'

const previewSettingsStore = usePreviewSettingsStore()
</script>

<template>
  <SettingsForm
    :definition="previewSettingsDefinition"
    :store="previewSettingsStore"
  />
</template>
