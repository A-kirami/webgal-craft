import { defineStore } from 'pinia'

export const useEditSettingsStore = defineStore(
  'edit-settings',
  () => {
    const fontFamily = $ref<string>('FiraCode, SourceHanSans, Consolas, "Courier New", monospace')
    const fontSize = $ref<number>(14)
    const wordWrap = $ref<boolean>(true)
    const minimap = $ref<boolean>(false)
    const autoSave = $ref<boolean>(true)
    const enablePreviewTab = $ref<boolean>(true)

    return $$({
      fontFamily,
      fontSize,
      wordWrap,
      minimap,
      autoSave,
      enablePreviewTab,
    })
  },
  {
    persist: true,
  },
)
