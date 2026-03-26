import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { BACKGROUND_EXTENSIONS, VIDEO_EXTENSIONS } from './common-params'
import { arg, content } from './schema'

import type { CommandEntry } from './schema'

const INTRO_DELAY_VALUES = Array.from({ length: 8 }, (_, index) => 1500 + index * 500)

function formatDelaySeconds(milliseconds: number): string {
  return String(milliseconds / 1000)
}

export const displayEntries: CommandEntry[] = [
  {
    type: commandType.intro,
    label: t => t('edit.visualEditor.commands.intro'),
    description: t => t('edit.visualEditor.commandDescriptions.intro'),
    icon: 'i-lucide-align-left',
    category: 'display',
    fields: [
      content({
        key: 'text',
        type: 'text',
        variant: { inline: 'textarea-auto', panel: 'textarea-grow' },
        inlineLayout: 'standalone',
        label: t => t('edit.visualEditor.params.introText'),
        placeholder: t => t('edit.visualEditor.params.introTextPlaceholder'),
      }),
      arg({
        key: 'fontSize',
        label: t => t('edit.visualEditor.params.fontSize'),
        type: 'choice',
        variant: { panel: 'segmented' },
        options: [
          { label: t => t('edit.visualEditor.options.small'), value: 'small' },
          { label: t => t('edit.visualEditor.options.medium'), value: 'medium' },
          { label: t => t('edit.visualEditor.options.large'), value: 'large' },
        ],
      }),
      arg({ key: 'fontColor', label: t => t('edit.visualEditor.params.fontColor'), type: 'color' }),
      arg({ key: 'backgroundColor', label: t => t('edit.visualEditor.params.backgroundColor'), type: 'color', visibleWhen: { key: 'backgroundImage', empty: true } }),
      arg({ key: 'backgroundImage', label: t => t('edit.visualEditor.params.backgroundImage'), type: 'file', fileConfig: { assetType: 'background', extensions: BACKGROUND_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.background') } }),
      arg({
        key: 'animation',
        label: t => t('edit.visualEditor.params.animation'),
        type: 'choice',
        options: [
          { label: t => t('edit.visualEditor.options.animFadeIn'), value: 'fadeIn' },
          { label: t => t('edit.visualEditor.options.animSlideIn'), value: 'slideIn' },
          { label: t => t('edit.visualEditor.options.animTyping'), value: 'typingEffect' },
          { label: t => t('edit.visualEditor.options.animPixelate'), value: 'pixelateEffect' },
          { label: t => t('edit.visualEditor.options.animReveal'), value: 'revealAnimation' },
        ],
      }),
      arg({
        key: 'delayTime',
        label: t => t('edit.visualEditor.params.delayTime'),
        type: 'choice',
        options: INTRO_DELAY_VALUES.map(delay => ({
          label: t => t('edit.visualEditor.options.delaySeconds', { seconds: formatDelaySeconds(delay) }),
          value: String(delay),
        })),
      }),
      arg({ key: 'hold', label: t => t('edit.visualEditor.params.hold'), type: 'switch', defaultValue: false }),
      arg({ key: 'userForward', label: t => t('edit.visualEditor.params.userForward'), type: 'switch', defaultValue: false }),
    ],
  },
  {
    type: commandType.video,
    label: t => t('edit.visualEditor.commands.video'),
    description: t => t('edit.visualEditor.commandDescriptions.video'),
    icon: 'i-lucide-film',
    category: 'display',
    fields: [
      content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'video', extensions: VIDEO_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.video') } }),
      arg({ key: 'skipOff', label: t => t('edit.visualEditor.params.skipOff'), type: 'switch', defaultValue: false }),
    ],
  },
  {
    type: commandType.filmMode,
    label: t => t('edit.visualEditor.commands.filmMode'),
    description: t => t('edit.visualEditor.commandDescriptions.filmMode'),
    icon: 'i-lucide-clapperboard',
    category: 'display',
    fields: [content({ key: 'state', type: 'switch', onValue: 'on', offValue: 'off', label: t => t('edit.visualEditor.params.filmModeState'), offLabel: t => t('edit.visualEditor.params.filmModeStateOff') })],
  },
  {
    type: commandType.setTextbox,
    label: t => t('edit.visualEditor.commands.setTextbox'),
    description: t => t('edit.visualEditor.commandDescriptions.setTextbox'),
    icon: 'i-lucide-panel-bottom',
    category: 'display',
    fields: [content({ key: 'state', type: 'switch', onValue: 'show', offValue: 'hide', label: t => t('edit.visualEditor.params.textboxState'), offLabel: t => t('edit.visualEditor.params.textboxStateOff') })],
  },
  {
    type: commandType.applyStyle,
    label: t => t('edit.visualEditor.commands.applyStyle'),
    description: t => t('edit.visualEditor.commandDescriptions.applyStyle'),
    icon: 'i-lucide-paintbrush',
    category: 'display',
    fields: [],
  },
]
