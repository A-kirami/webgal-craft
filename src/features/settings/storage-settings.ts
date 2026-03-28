import { defineSettingsSchema } from './schema'

export const storageSettingsDefinition = defineSettingsSchema({
  storage: {
    fields: {
      gameSavePath: {
        type: 'folderPicker',
        default: '',
        immediate: true,
        buttonLabel: t => t('settings.storage.browse'),
        dialogTitle: t => t('settings.storage.gamePath.title'),
        label: t => t('settings.storage.gamePath.label'),
      },
      engineSavePath: {
        type: 'folderPicker',
        default: '',
        immediate: true,
        buttonLabel: t => t('settings.storage.browse'),
        dialogTitle: t => t('settings.storage.enginePath.title'),
        label: t => t('settings.storage.enginePath.label'),
      },
    },
  },
} as const)
