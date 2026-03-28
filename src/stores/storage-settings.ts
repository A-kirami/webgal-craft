import { defineStore } from 'pinia'

import { storageSettingsDefinition } from '~/features/settings/storage-settings'

export const useStorageSettingsStore = defineStore(
  'storage-settings',
  () => {
    const state = reactive({ ...storageSettingsDefinition.defaults })

    return {
      ...toRefs(state),
    }
  },
  {
    persist: true,
  },
)
