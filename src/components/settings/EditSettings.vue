<script setup lang="ts">
import { editSettingsDefinition } from '~/features/settings/edit-settings'
import { useEditSettingsStore } from '~/stores/edit-settings'

const editSettingsStore = useEditSettingsStore()
</script>

<template>
  <SettingsForm
    :definition="editSettingsDefinition"
    :store="editSettingsStore"
  />
</template>
