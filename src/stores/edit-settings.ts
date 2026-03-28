import { defineStore } from 'pinia'

import { editSettingsDefinition } from '~/features/settings/edit-settings'

export const useEditSettingsStore = defineStore(
  'edit-settings',
  () => {
    const state = reactive({ ...editSettingsDefinition.defaults })

    return {
      ...toRefs(state),
    }
  },
  {
    persist: true,
  },
)
