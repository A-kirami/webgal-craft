import { defineStore } from 'pinia'

import { backupSettingsDefinition } from '~/features/settings/backup-settings'

export const useBackupSettingsStore = defineStore(
  'backup-settings',
  () => {
    const state = reactive({ ...backupSettingsDefinition.defaults })

    return {
      ...toRefs(state),
    }
  },
  {
    persist: true,
  },
)
