import { defineStore } from 'pinia'

export const useSettingsStore = defineStore(
  'settings',
  () => {
    const gameSavePath = $ref<string>('')
    const engineSavePath = $ref<string>('')

    return $$({
      gameSavePath,
      engineSavePath,
    })
  },
  {
    persist: true,
  },
)
