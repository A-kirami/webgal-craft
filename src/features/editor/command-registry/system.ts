import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { AUDIO_EXTENSIONS, BACKGROUND_EXTENSIONS, SERIES } from './common-params'
import { arg, content } from './schema'

import type { CommandEntry } from './schema'

export const systemEntries: CommandEntry[] = [
  {
    type: commandType.setVar,
    label: t => t('edit.visualEditor.commands.setVar'),
    description: t => t('edit.visualEditor.commandDescriptions.setVar'),
    icon: 'i-lucide-variable',
    category: 'system',
    fields: [arg({ key: 'global', label: t => t('edit.visualEditor.params.global'), type: 'switch', defaultValue: false })],
  },
  {
    type: commandType.showVars,
    label: t => t('edit.visualEditor.commands.showVars'),
    description: t => t('edit.visualEditor.commandDescriptions.showVars'),
    icon: 'i-lucide-eye',
    category: 'system',
    fields: [],
    locked: true,
  },
  {
    type: commandType.getUserInput,
    label: t => t('edit.visualEditor.commands.getUserInput'),
    description: t => t('edit.visualEditor.commandDescriptions.getUserInput'),
    icon: 'i-lucide-keyboard',
    category: 'system',
    fields: [
      content({ key: 'varName', label: t => t('edit.visualEditor.params.varName'), type: 'text' }),
      arg({ key: 'title', label: t => t('edit.visualEditor.params.inputTitle'), type: 'text' }),
      arg({ key: 'buttonText', label: t => t('edit.visualEditor.params.buttonText'), type: 'text' }),
      arg({ key: 'default', label: t => t('edit.visualEditor.params.defaultValue'), type: 'text' }),
    ],
  },
  {
    type: commandType.wait,
    label: t => t('edit.visualEditor.commands.wait'),
    description: t => t('edit.visualEditor.commandDescriptions.wait'),
    icon: 'i-lucide-timer',
    category: 'system',
    fields: [content({ key: 'time', label: t => t('edit.visualEditor.params.waitTime'), unit: t => t('edit.visualEditor.params.unitMs'), min: 0, type: 'number' })],
  },
  {
    type: commandType.unlockCg,
    label: t => t('edit.visualEditor.commands.unlockCg'),
    description: t => t('edit.visualEditor.commandDescriptions.unlockCg'),
    icon: 'i-lucide-image-plus',
    category: 'system',
    fields: [
      content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'background', extensions: BACKGROUND_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.unlockCg') } }),
      arg({ key: 'name', label: t => t('edit.visualEditor.params.unlockDisplayName'), type: 'text' }),
      arg({ ...SERIES, visibleWhen: { key: 'name', notEmpty: true } }),
    ],
  },
  {
    type: commandType.unlockBgm,
    label: t => t('edit.visualEditor.commands.unlockBgm'),
    description: t => t('edit.visualEditor.commandDescriptions.unlockBgm'),
    icon: 'i-lucide-music-2',
    category: 'system',
    fields: [
      content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'bgm', extensions: AUDIO_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.unlockBgm') } }),
      arg({ key: 'name', label: t => t('edit.visualEditor.params.unlockDisplayName'), type: 'text' }),
      arg({ ...SERIES, visibleWhen: { key: 'name', notEmpty: true } }),
    ],
  },
  {
    type: commandType.callSteam,
    label: t => t('edit.visualEditor.commands.callSteam'),
    description: t => t('edit.visualEditor.commandDescriptions.callSteam'),
    icon: 'i-lucide-gamepad-2',
    category: 'system',
    fields: [arg({ key: 'achievementId', label: t => t('edit.visualEditor.params.achievementId'), type: 'text', inputAutoWidth: true })],
  },
  {
    type: commandType.comment,
    label: t => t('edit.visualEditor.commands.comment'),
    description: t => t('edit.visualEditor.commandDescriptions.comment'),
    icon: 'i-lucide-hash',
    category: 'comment',
    fields: [content({ key: 'text', label: t => t('edit.visualEditor.params.commentContent'), type: 'text' })],
  },
]
