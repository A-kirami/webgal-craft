import { defineStore } from 'pinia'

import { previewSettingsDefinition } from '~/features/settings/preview-settings'

export const usePreviewSettingsStore = defineStore(
  'preview-settings',
  () => {
    const state = reactive({ ...previewSettingsDefinition.defaults })

    return {
      ...toRefs(state),
    }
  },
  {
    persist: true,
  },
)
