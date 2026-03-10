import { defineStore } from 'pinia'

export const usePreviewSettingsStore = defineStore(
  'preview-settings',
  () => {
    const enableLivePreview = $ref(true)
    const enableFastPreview = $ref(false)
    const enableRealtimeEffectPreview = $ref(true)

    return $$({
      enableLivePreview,
      enableFastPreview,
      enableRealtimeEffectPreview,
    })
  },
  {
    persist: true,
  },
)
