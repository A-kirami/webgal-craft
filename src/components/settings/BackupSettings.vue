<script setup lang="ts">
import { backupSettingsDefinition } from '~/features/settings/backup-settings'
import { useBackupSettingsStore } from '~/stores/backup-settings'

const backupSettingsStore = useBackupSettingsStore()
</script>

<template>
  <SettingsForm
    :definition="backupSettingsDefinition"
    :store="backupSettingsStore"
  />
</template>
