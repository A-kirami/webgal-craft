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
        description: t => t('settings.storage.gamePath.description'),
      },
      engineSavePath: {
        type: 'folderPicker',
        default: '',
        immediate: true,
        readonlyOnAndroid: true,
        buttonLabel: t => t('settings.storage.browse'),
        dialogTitle: t => t('settings.storage.enginePath.title'),
        label: t => t('settings.storage.enginePath.label'),
        description: t => t('settings.storage.enginePath.description'),
      },
      templateSavePath: {
        type: 'folderPicker',
        default: '',
        immediate: true,
        readonlyOnAndroid: true,
        buttonLabel: t => t('settings.storage.browse'),
        dialogTitle: t => t('settings.storage.templatePath.title'),
        label: t => t('settings.storage.templatePath.label'),
        description: t => t('settings.storage.templatePath.description'),
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
        description: t => t('settings.storage.exportPath.description'),
      },
    },
  },
} as const)
