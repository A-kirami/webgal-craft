import { defineSettingsSchema } from './schema'

export const backupSettingsDefinition = defineSettingsSchema({
  local: {
    label: t => t('settings.backup.local'),
    fields: {
      maxVersions: {
        type: 'number',
        default: 50,
        min: 1,
        max: 1000,
        immediate: true,
        label: t => t('settings.backup.maxVersions.label'),
        description: t => t('settings.backup.maxVersions.description'),
      },
      maxDays: {
        type: 'number',
        default: 30,
        min: 1,
        max: 3650,
        immediate: true,
        label: t => t('settings.backup.maxDays.label'),
        description: t => t('settings.backup.maxDays.description'),
      },
    },
  },
} as const)
