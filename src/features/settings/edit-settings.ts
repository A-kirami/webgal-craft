import { defineSettingsSchema } from './schema'

export const editSettingsDefinition = defineSettingsSchema({
  general: {
    label: t => t('settings.edit.general'),
    fields: {
      autoSave: {
        type: 'switch',
        default: true,
        label: t => t('settings.edit.autoSave.label'),
        description: t => t('settings.edit.autoSave.description'),
      },
      enablePreviewTab: {
        type: 'switch',
        default: true,
        label: t => t('settings.edit.enablePreviewTab.label'),
        description: t => t('settings.edit.enablePreviewTab.description'),
      },
      autoApplyEffectEditorChanges: {
        type: 'switch',
        default: false,
        label: t => t('settings.edit.autoApplyEffectEditorChanges.label'),
        description: t => t('settings.edit.autoApplyEffectEditorChanges.description'),
      },
      commandInsertPosition: {
        type: 'select',
        default: 'afterCursor',
        label: t => t('settings.edit.commandInsertPosition.label'),
        description: t => t('settings.edit.commandInsertPosition.description'),
        options: [
          { value: 'afterCursor', label: t => t('settings.edit.commandInsertPosition.afterCursor') },
          { value: 'end', label: t => t('settings.edit.commandInsertPosition.end') },
        ],
      },
      effectEditorSide: {
        type: 'select',
        default: 'right',
        label: t => t('settings.edit.effectEditorSide.label'),
        description: t => t('settings.edit.effectEditorSide.description'),
        options: [
          { value: 'left', label: t => t('settings.edit.effectEditorSide.left') },
          { value: 'right', label: t => t('settings.edit.effectEditorSide.right') },
        ],
      },
    },
  },
  preview: {
    label: t => t('settings.edit.preview'),
    fields: {
      enableLivePreview: {
        type: 'switch',
        default: true,
        label: t => t('settings.edit.enableLivePreview.label'),
        description: t => t('settings.edit.enableLivePreview.description'),
      },
      enableRealtimeEffectPreview: {
        type: 'switch',
        default: true,
        experimental: true,
        visibleWhen: 'enableLivePreview',
        label: t => t('settings.edit.enableRealtimeEffectPreview.label'),
        description: t => t('settings.edit.enableRealtimeEffectPreview.description'),
      },
    },
  },
  textEditor: {
    label: t => t('settings.edit.textEditor'),
    fields: {
      fontFamily: {
        type: 'input',
        default: 'FiraCode, SourceHanSans, Consolas, "Courier New", monospace',
        label: t => t('settings.edit.fontFamily.label'),
        placeholder: t => t('settings.edit.fontFamily.placeholder'),
      },
      fontSize: {
        type: 'number',
        default: 14,
        min: 8,
        max: 48,
        label: t => t('settings.edit.fontSize.label'),
      },
      wordWrap: {
        type: 'switch',
        default: true,
        label: t => t('settings.edit.wordWrap.label'),
        description: t => t('settings.edit.wordWrap.description'),
      },
      minimap: {
        type: 'switch',
        default: false,
        label: t => t('settings.edit.minimap.label'),
        description: t => t('settings.edit.minimap.description'),
      },
    },
  },
  visualEditor: {
    label: t => t('settings.edit.visualEditor'),
    fields: {
      collapseStatementsOnSidebarOpen: {
        type: 'switch',
        default: true,
        label: t => t('settings.edit.collapseStatementsOnSidebarOpen.label'),
        description: t => t('settings.edit.collapseStatementsOnSidebarOpen.description'),
      },
      showSidebarAssetPreview: {
        type: 'switch',
        default: true,
        label: t => t('settings.edit.showSidebarAssetPreview.label'),
        description: t => t('settings.edit.showSidebarAssetPreview.description'),
      },
      enableComboboxPathDelimiter: {
        type: 'switch',
        default: true,
        label: t => t('settings.edit.enableComboboxPathDelimiter.label'),
        description: t => t('settings.edit.enableComboboxPathDelimiter.description'),
      },
      comboboxPathDelimiter: {
        type: 'input',
        default: '/',
        className: 'w-25',
        label: t => t('settings.edit.comboboxPathDelimiter.label'),
        description: t => t('settings.edit.comboboxPathDelimiter.description'),
        visibleWhen: 'enableComboboxPathDelimiter',
      },
    },
  },
} as const)
