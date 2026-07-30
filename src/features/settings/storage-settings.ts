import { defineSettingsSchema } from './schema'

export const storageSettingsDefinition = defineSettingsSchema({
  storage: {
    fields: {
      gameSavePath: {
        type: 'folderPicker',
        default: '',
        immediate: true,
        readonlyOnAndroid: true,
        buttonLabel: t => t('settings.storage.browse'),
        dialogTitle: t => t('settings.storage.gamePath.title'),
        label: t => t('settings.storage.gamePath.label'),
      },
      engineSavePath: {
        type: 'folderPicker',
        default: '',
        immediate: true,
        readonlyOnAndroid: true,
        buttonLabel: t => t('settings.storage.browse'),
        dialogTitle: t => t('settings.storage.enginePath.title'),
        label: t => t('settings.storage.enginePath.label'),
      },
      templateSavePath: {
        type: 'folderPicker',
        default: '',
        immediate: true,
        readonlyOnAndroid: true,
        buttonLabel: t => t('settings.storage.browse'),
        dialogTitle: t => t('settings.storage.templatePath.title'),
        label: t => t('settings.storage.templatePath.label'),
      },
      exportSavePath: {
        type: 'folderPicker',
        default: '',
        immediate: true,
        androidDisplayValue: t => t('settings.storage.exportPath.androidDestination'),
        readonlyOnAndroid: true,
        buttonLabel: t => t('settings.storage.browse'),
        dialogTitle: t => t('settings.storage.exportPath.title'),
        label: t => t('settings.storage.exportPath.label'),
      },
    },
  },
} as const)
