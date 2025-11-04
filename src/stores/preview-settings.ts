import { defineStore } from 'pinia'

export const usePreviewSettingsStore = defineStore(
  'preview-settings',
  () => {
    const enableLivePreview = $ref<boolean>(true)
    const enableFastPreview = $ref<boolean>(false)

    return $$({
      enableLivePreview,
      enableFastPreview,
    })
  },
  {
    persist: true,
  },
)
