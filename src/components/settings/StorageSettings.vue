<script setup lang="ts">
import { storageSettingsDefinition } from '~/features/settings/storage-settings'
import { useStorageSettingsStore } from '~/stores/storage-settings'

const storageSettingsStore = useStorageSettingsStore()
</script>

<template>
  <SettingsForm
    :definition="storageSettingsDefinition"
    :store="storageSettingsStore"
  />
</template>
