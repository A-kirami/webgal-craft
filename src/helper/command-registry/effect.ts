import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { BACKGROUND_EXTENSIONS, DURATION, EFFECT_DURATION, EFFECT_EASE, ENTER_ANIMATION, EXIT_ANIMATION, KEEP, NEXT, TARGET, WRITE_DEFAULT } from './common-params'
import { arg, content } from './schema'

import type { CommandEntry } from './schema'

const INTRO_DELAY_VALUES = Array.from({ length: 8 }, (_, index) => 1500 + index * 500)

function formatDelaySeconds(milliseconds: number): string {
  return String(milliseconds / 1000)
}

export const effectEntries: CommandEntry[] = [
  {
    type: commandType.setAnimation,
    label: t => t('edit.visualEditor.commands.setAnimation'),
    icon: 'i-lucide-file-video',
    category: 'effect',
    fields: [
      content({ key: 'animation', label: t => t('edit.visualEditor.params.animationName'), type: 'choice', variant: 'combobox', placeholder: t => t('edit.visualEditor.placeholder.searchAnimation'), dynamicOptionsKey: 'animationTableEntries', options: [] }),
      arg(TARGET),
      arg(WRITE_DEFAULT),
      arg(KEEP),
      arg(NEXT),
    ],
  },
  {
    type: commandType.setComplexAnimation,
    label: t => t('edit.visualEditor.commands.setComplexAnimation'),
    icon: 'i-lucide-box',
    category: 'effect',
    fields: [
      content({
        key: 'animation',
        label: t => t('edit.visualEditor.params.animationName'),
        type: 'choice',
        options: [
          { label: t => t('edit.visualEditor.options.universalSoftIn'), value: 'universalSoftIn' },
          { label: t => t('edit.visualEditor.options.universalSoftOff'), value: 'universalSoftOff' },
        ],
      }),
      arg(TARGET),
      arg(DURATION),
      arg(NEXT),
    ],
  },
  {
    type: commandType.setTransform,
    label: t => t('edit.visualEditor.commands.setTransform'),
    icon: 'i-lucide-play',
    category: 'effect',
    hasEffectEditor: true,
    fields: [
      content({ key: 'json', label: t => t('edit.visualEditor.params.transformJson'), type: 'text', managedByEffectEditor: true }),
      arg(TARGET),
      arg(EFFECT_DURATION),
      arg(EFFECT_EASE),
      arg(WRITE_DEFAULT),
      arg(KEEP),
      arg(NEXT),
    ],
  },
  {
    type: commandType.setTransition,
    label: t => t('edit.visualEditor.commands.setTransition'),
    icon: 'i-lucide-blend',
    category: 'effect',
    fields: [
      arg(TARGET),
      arg({ ...ENTER_ANIMATION, advanced: false }),
      arg({ ...EXIT_ANIMATION, advanced: false }),
    ],
  },
  {
    type: commandType.pixi,
    label: t => t('edit.visualEditor.commands.pixi'),
    icon: 'i-lucide-wand-sparkles',
    category: 'effect',
    fields: [
      content({
        key: 'effect',
        label: t => t('edit.visualEditor.params.effectName'),
        type: 'choice',
        className: 'min-w-20',
        customizable: true,
        customLabel: t => t('edit.visualEditor.params.effectCustomName'),
        options: [
          { label: t => t('edit.visualEditor.options.effectRain'), value: 'rain' },
          { label: t => t('edit.visualEditor.options.effectSnow'), value: 'snow' },
          { label: t => t('edit.visualEditor.options.effectHeavySnow'), value: 'heavySnow' },
          { label: t => t('edit.visualEditor.options.effectCherryBlossoms'), value: 'cherryBlossoms' },
        ],
      }),
    ],
  },
  {
    type: commandType.pixiInit,
    label: t => t('edit.visualEditor.commands.pixiInit'),
    icon: 'i-lucide-eraser',
    category: 'effect',
    fields: [],
    locked: true,
  },
  {
    type: commandType.setTempAnimation,
    label: t => t('edit.visualEditor.commands.setTempAnimation'),
    icon: 'i-lucide-layers',
    category: 'effect',
    fields: [
      content({ key: 'animation', label: t => t('edit.visualEditor.params.animationName'), type: 'text' }),
      arg(TARGET),
      arg(WRITE_DEFAULT),
      arg(KEEP),
      arg(NEXT),
    ],
  },
  {
    type: commandType.applyStyle,
    label: t => t('edit.visualEditor.commands.applyStyle'),
    icon: 'i-lucide-paintbrush',
    category: 'effect',
    fields: [],
  },
  {
    type: commandType.intro,
    label: t => t('edit.visualEditor.commands.intro'),
    icon: 'i-lucide-align-left',
    category: 'display',
    fields: [
      content({
        key: 'text',
        type: 'text',
        variant: { inline: 'textarea-auto', panel: 'textarea-fixed' },
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
]
