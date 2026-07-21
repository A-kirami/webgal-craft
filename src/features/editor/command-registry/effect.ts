import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { ANIMATION_RESOURCE_REFERENCE, CONTINUE, DURATION, EFFECT_DURATION, EFFECT_EASE, ENTER_ANIMATION, EXIT_ANIMATION, IGNORE_DEFAULT, KEEP, NEXT, PARALLEL, TARGET, WRITE_DEFAULT } from './common-params'
import { arg, content } from './schema'

import type { CommandEntry } from './schema'

export const effectEntries: CommandEntry[] = [
  {
    type: commandType.setTransform,
    label: t => t('edit.visualEditor.commands.setTransform'),
    description: t => t('edit.visualEditor.commandDescriptions.setTransform'),
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
      arg(PARALLEL),
      arg(IGNORE_DEFAULT),
      arg(NEXT),
      arg(CONTINUE),
    ],
  },
  {
    type: commandType.setTempAnimation,
    label: t => t('edit.visualEditor.commands.setTempAnimation'),
    description: t => t('edit.visualEditor.commandDescriptions.setTempAnimation'),
    icon: 'i-lucide-layers',
    category: 'effect',
    hasAnimationEditor: true,
    fields: [
      content({ key: 'animation', label: t => t('edit.visualEditor.params.animationName'), type: 'text' }),
      arg(TARGET),
      arg(WRITE_DEFAULT),
      arg(KEEP),
      arg(PARALLEL),
      arg(IGNORE_DEFAULT),
      arg(NEXT),
      arg(CONTINUE),
    ],
  },
  {
    type: commandType.setAnimation,
    label: t => t('edit.visualEditor.commands.setAnimation'),
    description: t => t('edit.visualEditor.commandDescriptions.setAnimation'),
    icon: 'i-lucide-file-video',
    category: 'effect',
    fields: [
      content({ key: 'animation', label: t => t('edit.visualEditor.params.animationName'), type: 'choice', resourceReference: ANIMATION_RESOURCE_REFERENCE, variant: 'combobox', placeholder: t => t('edit.visualEditor.placeholder.searchAnimation'), dynamicOptionsKey: 'animationTableEntries', grouping: { mode: 'path' }, options: [] }),
      arg(TARGET),
      arg(WRITE_DEFAULT),
      arg(KEEP),
      arg(PARALLEL),
      arg(IGNORE_DEFAULT),
      arg(NEXT),
      arg(CONTINUE),
    ],
  },
  {
    type: commandType.setComplexAnimation,
    label: t => t('edit.visualEditor.commands.setComplexAnimation'),
    description: t => t('edit.visualEditor.commandDescriptions.setComplexAnimation'),
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
      arg(CONTINUE),
    ],
  },
  {
    type: commandType.setTransition,
    label: t => t('edit.visualEditor.commands.setTransition'),
    description: t => t('edit.visualEditor.commandDescriptions.setTransition'),
    icon: 'i-lucide-blend',
    category: 'effect',
    fields: [
      arg(TARGET),
      arg({ ...ENTER_ANIMATION, advanced: false }),
      arg({ ...EXIT_ANIMATION, advanced: false }),
      arg(IGNORE_DEFAULT),
    ],
  },
  // 粒子特效
  {
    type: commandType.pixi,
    label: t => t('edit.visualEditor.commands.pixi'),
    description: t => t('edit.visualEditor.commandDescriptions.pixi'),
    icon: 'i-lucide-wand-sparkles',
    category: 'effect',
    fields: [
      content({
        key: 'effect',
        label: t => t('edit.visualEditor.params.effectName'),
        type: 'text',
        variant: 'autocomplete',
        autocomplete: [{
          type: 'static',
          options: [
            { label: t => t('edit.visualEditor.options.effectRain'), value: 'rain' },
            { label: t => t('edit.visualEditor.options.effectSnow'), value: 'snow' },
            { label: t => t('edit.visualEditor.options.effectHeavySnow'), value: 'heavySnow' },
            { label: t => t('edit.visualEditor.options.effectCherryBlossoms'), value: 'cherryBlossoms' },
          ],
        }],
      }),
    ],
  },
  {
    type: commandType.pixiInit,
    label: t => t('edit.visualEditor.commands.pixiInit'),
    description: t => t('edit.visualEditor.commandDescriptions.pixiInit'),
    icon: 'i-lucide-eraser',
    category: 'effect',
    fields: [],
    locked: true,
  },
]
