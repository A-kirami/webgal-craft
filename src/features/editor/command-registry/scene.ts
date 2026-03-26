import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { content } from './schema'

import type { CommandEntry } from './schema'

export const sceneEntries: CommandEntry[] = [
  {
    type: commandType.changeScene,
    label: t => t('edit.visualEditor.commands.changeScene'),
    description: t => t('edit.visualEditor.commandDescriptions.changeScene'),
    icon: 'i-lucide-arrow-right-left',
    category: 'scene',
    fields: [content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'scene', extensions: ['.txt'], title: t => t('edit.visualEditor.filePicker.scene') } })],
  },
  {
    type: commandType.callScene,
    label: t => t('edit.visualEditor.commands.callScene'),
    description: t => t('edit.visualEditor.commandDescriptions.callScene'),
    icon: 'i-lucide-corner-right-up',
    category: 'scene',
    fields: [content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'scene', extensions: ['.txt'], title: t => t('edit.visualEditor.filePicker.scene') } })],
  },
  {
    type: commandType.choose,
    label: t => t('edit.visualEditor.commands.choose'),
    description: t => t('edit.visualEditor.commandDescriptions.choose'),
    icon: 'i-lucide-list',
    category: 'scene',
    fields: [content({ key: 'file', label: t => t('edit.visualEditor.params.choiceText'), type: 'file', fileConfig: { assetType: 'scene', extensions: ['.txt'], title: t => t('edit.visualEditor.filePicker.scene') } })],
  },
  {
    type: commandType.label,
    label: t => t('edit.visualEditor.commands.label'),
    description: t => t('edit.visualEditor.commandDescriptions.label'),
    icon: 'i-lucide-bookmark',
    category: 'scene',
    fields: [content({ key: 'name', label: t => t('edit.visualEditor.params.labelName'), type: 'text', inputAutoWidth: true })],
  },
  {
    type: commandType.jumpLabel,
    label: t => t('edit.visualEditor.commands.jumpLabel'),
    description: t => t('edit.visualEditor.commandDescriptions.jumpLabel'),
    icon: 'i-lucide-arrow-down-to-dot',
    category: 'scene',
    fields: [content({ key: 'name', label: t => t('edit.visualEditor.params.labelName'), type: 'text', inputAutoWidth: true })],
  },
  {
    type: commandType.end,
    label: t => t('edit.visualEditor.commands.end'),
    description: t => t('edit.visualEditor.commandDescriptions.end'),
    icon: 'i-lucide-log-out',
    category: 'scene',
    fields: [],
    locked: true,
  },
]
