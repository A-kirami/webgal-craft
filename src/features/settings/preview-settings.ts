import { defineSettingsSchema } from './schema'

export const previewSettingsDefinition = defineSettingsSchema({
  preview: {
    fields: {
      enableLivePreview: {
        type: 'switch',
        default: true,
        label: t => t('settings.preview.enableLivePreview.label'),
        description: t => t('settings.preview.enableLivePreview.description'),
      },
      enableFastPreview: {
        type: 'switch',
        default: false,
        experimental: true,
        visibleWhen: 'enableLivePreview',
        label: t => t('settings.preview.enableFastPreview.label'),
        description: t => t('settings.preview.enableFastPreview.description'),
      },
      enableRealtimeEffectPreview: {
        type: 'switch',
        default: true,
        experimental: true,
        visibleWhen: 'enableLivePreview',
        label: t => t('settings.preview.enableRealtimeEffectPreview.label'),
        description: t => t('settings.preview.enableRealtimeEffectPreview.description'),
      },
    },
  },
} as const)
