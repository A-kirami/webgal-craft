<script setup lang="ts">
import { storageSettingsDefinition } from '~/features/settings/storage-settings'
import { useStorageSettingsStore } from '~/stores/storage-settings'

import SettingsForm from './form/SettingsForm.vue'

const storageSettingsStore = useStorageSettingsStore()
</script>

<template>
  <SettingsForm
    :definition="storageSettingsDefinition"
    :store="storageSettingsStore"
  />
</template>
