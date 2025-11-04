import { defineStore } from 'pinia'

export const useStorageSettingsStore = defineStore(
  'storage-settings',
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
