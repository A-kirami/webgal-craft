<script setup lang="ts">
import { editSettingsDefinition } from '~/features/settings/edit-settings'
import { useEditSettingsStore } from '~/stores/edit-settings'

import SettingsForm from './form/SettingsForm.vue'

const editSettingsStore = useEditSettingsStore()
</script>

<template>
  <SettingsForm
    :definition="editSettingsDefinition"
    :store="editSettingsStore"
  />
</template>
