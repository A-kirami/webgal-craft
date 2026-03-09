import { commandType } from 'webgal-parser/src/interface/sceneInterface'

export const controlEntries: CommandEntry[] = [
  {
    type: commandType.setVar,
    label: t => t('edit.visualEditor.commands.setVar'),
    icon: 'i-lucide-variable',
    category: 'logic',
    fields: [arg({ key: 'global', label: t => t('edit.visualEditor.params.global'), type: 'switch', defaultValue: false })],
  },
  {
    type: commandType.showVars,
    label: t => t('edit.visualEditor.commands.showVars'),
    icon: 'i-lucide-eye',
    category: 'logic',
    fields: [],
    locked: true,
  },
  {
    type: commandType.getUserInput,
    label: t => t('edit.visualEditor.commands.getUserInput'),
    icon: 'i-lucide-keyboard',
    category: 'logic',
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
    icon: 'i-lucide-timer',
    category: 'logic',
    fields: [content({ key: 'time', label: t => t('edit.visualEditor.params.waitTime'), unit: t => t('edit.visualEditor.params.unitMs'), min: 0, type: 'number' })],
  },
  {
    type: commandType.setTextbox,
    label: t => t('edit.visualEditor.commands.setTextbox'),
    icon: 'i-lucide-panel-bottom',
    category: 'display',
    fields: [content({ key: 'state', type: 'switch', onValue: 'show', offValue: 'hide', label: t => t('edit.visualEditor.params.textboxState'), offLabel: t => t('edit.visualEditor.params.textboxStateOff') })],
  },
  {
    type: commandType.filmMode,
    label: t => t('edit.visualEditor.commands.filmMode'),
    icon: 'i-lucide-clapperboard',
    category: 'display',
    fields: [content({ key: 'state', type: 'switch', onValue: 'on', offValue: 'off', label: t => t('edit.visualEditor.params.filmModeState'), offLabel: t => t('edit.visualEditor.params.filmModeStateOff') })],
  },
  {
    type: commandType.callSteam,
    label: t => t('edit.visualEditor.commands.callSteam'),
    icon: 'i-lucide-gamepad-2',
    category: 'display',
    fields: [arg({ key: 'achievementId', label: t => t('edit.visualEditor.params.achievementId'), type: 'text', inputAutoWidth: true })],
  },
]
