import { defineStore } from 'pinia'

import { AbsPath } from '~/domain/path'
import { storageSettingsDefinition } from '~/features/settings/storage-settings'

function rebrandStoredAbsPath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return ''
  }
  return AbsPath.from(value)
}

export const useStorageSettingsStore = defineStore(
  'storage-settings',
  () => {
    const state = reactive({ ...storageSettingsDefinition.defaults })

    return {
      ...toRefs(state),
    }
  },
  {
    persist: {
      serializer: {
        serialize: JSON.stringify,
        deserialize: (raw) => {
          const state = JSON.parse(raw) as Record<string, unknown>
          return {
            ...state,
            gameSavePath: rebrandStoredAbsPath(state.gameSavePath),
            engineSavePath: rebrandStoredAbsPath(state.engineSavePath),
            exportSavePath: rebrandStoredAbsPath(state.exportSavePath),
            templateSavePath: rebrandStoredAbsPath(state.templateSavePath),
          }
        },
      },
    },
  },
)
