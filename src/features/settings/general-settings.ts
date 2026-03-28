import { defineSettingsSchema } from './schema'

export const generalSettingsDefinition = defineSettingsSchema({
  general: {
    fields: {
      language: {
        type: 'select',
        default: 'system',
        immediate: true,
        label: t => t('settings.general.language.label'),
        placeholder: t => t('settings.general.language.placeholder'),
        options: [
          { value: 'system', label: t => t('settings.general.followSystem') },
          { value: 'zh-Hans', label: '简体中文' },
          { value: 'zh-Hant', label: '繁體中文' },
          { value: 'en', label: 'English' },
          { value: 'ja', label: '日本語' },
        ],
      },
      openLastProject: {
        type: 'switch',
        default: false,
        label: t => t('settings.general.openLastProject.label'),
        description: t => t('settings.general.openLastProject.description'),
      },
      autoInstallUpdates: {
        type: 'switch',
        default: true,
        label: t => t('settings.general.autoInstallUpdates.label'),
        description: t => t('settings.general.autoInstallUpdates.description'),
      },
    },
  },
} as const)
