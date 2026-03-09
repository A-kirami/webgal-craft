import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { AUDIO_EXTENSIONS, BACKGROUND_EXTENSIONS, DEFAULT_ENTER_DURATION, DEFAULT_EXIT_DURATION, EFFECT_DURATION, EFFECT_EASE, EFFECT_TRANSFORM, ENTER_ANIMATION, EXIT_ANIMATION, FIGURE_EXTENSIONS, ID, IMAGE_EXTENSIONS, NEXT, SERIES, UNLOCK_NAME, VIDEO_EXTENSIONS, VOLUME } from './common-params'
import { arg, content, UNSPECIFIED } from './schema'

import type { CommandEntry } from './schema'

function isLive2dContent(content: string): boolean {
  return content.endsWith('.json') && !content.includes('?type=spine')
}

function isAnimatedContent(content: string): boolean {
  return content.endsWith('.json') || content.endsWith('.skel') || content.includes('?type=spine')
}

function isSpineContent(content: string): boolean {
  return content.endsWith('.skel') || content.includes('?type=spine')
}

function isImageContent(content: string): boolean {
  return !!content && !isAnimatedContent(content)
}

export const mediaEntries: CommandEntry[] = [
  {
    type: commandType.changeBg,
    label: t => t('edit.visualEditor.commands.changeBg'),
    icon: 'i-lucide-image',
    category: 'media',
    hasEffectEditor: true,
    fields: [
      content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'background', extensions: BACKGROUND_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.background') } }),
      arg(UNLOCK_NAME),
      arg({ ...SERIES, visibleWhen: { key: 'unlockname', notEmpty: true } }),
      arg(EFFECT_TRANSFORM),
      arg(EFFECT_DURATION),
      arg(EFFECT_EASE),
      arg(ENTER_ANIMATION),
      arg(EXIT_ANIMATION),
      arg(DEFAULT_ENTER_DURATION),
      arg(DEFAULT_EXIT_DURATION),
      arg(NEXT),
    ],
  },
  {
    type: commandType.changeFigure,
    label: t => t('edit.visualEditor.commands.changeFigure'),
    icon: 'i-lucide-user',
    category: 'media',
    hasEffectEditor: true,
    fields: [
      content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'figure', extensions: FIGURE_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.figure') } }),
      arg({
        key: 'position',
        label: t => t('edit.visualEditor.params.position'),
        type: 'choice',
        mode: 'flag',
        variant: { panel: 'segmented' },
        options: [
          { label: t => t('edit.visualEditor.options.left'), value: 'left' },
          { label: t => t('edit.visualEditor.options.center'), value: UNSPECIFIED },
          { label: t => t('edit.visualEditor.options.right'), value: 'right' },
        ],
      }),
      arg({ key: 'zIndex', label: t => t('edit.visualEditor.params.zIndex'), type: 'number' }),
      arg({ ...ID, key: 'id', label: t => t('edit.visualEditor.params.figureId') }),
      arg({
        key: 'motion',
        label: (t, content) => isSpineContent(content ?? '') ? t('edit.visualEditor.params.spineMotion') : t('edit.visualEditor.params.motion'),
        type: 'choice',
        variant: 'combobox',
        placeholder: (t, content) => isSpineContent(content ?? '') ? t('edit.visualEditor.placeholder.searchAnimation') : t('edit.visualEditor.placeholder.searchMotion'),
        dynamicOptionsKey: 'figureMotions',
        visibleWhenContent: isAnimatedContent,
        options: [],
      }),
      arg({ key: 'expression', label: t => t('edit.visualEditor.params.expression'), type: 'choice', variant: 'combobox', placeholder: t => t('edit.visualEditor.placeholder.searchExpression'), dynamicOptionsKey: 'figureExpressions', visibleWhenContent: isLive2dContent, options: [] }),
      arg({
        key: 'blendMode',
        label: t => t('edit.visualEditor.params.blendMode'),
        type: 'choice',
        advanced: true,
        defaultValue: 'default',
        options: [
          { label: t => t('edit.visualEditor.options.default'), value: 'default' },
          { label: t => t('edit.visualEditor.options.blendNormal'), value: 'normal' },
          { label: t => t('edit.visualEditor.options.blendAdd'), value: 'add' },
          { label: t => t('edit.visualEditor.options.blendMultiply'), value: 'multiply' },
          { label: t => t('edit.visualEditor.options.blendScreen'), value: 'screen' },
        ],
      }),
      arg(EFFECT_TRANSFORM),
      arg(EFFECT_DURATION),
      arg(EFFECT_EASE),
      arg(ENTER_ANIMATION),
      arg(EXIT_ANIMATION),
      arg(DEFAULT_ENTER_DURATION),
      arg(DEFAULT_EXIT_DURATION),
      arg({ key: 'animationFlag', label: t => t('edit.visualEditor.params.animationFlag'), type: 'switch', defaultValue: false, visibleWhenContent: isImageContent, advanced: true }),
      arg({ key: 'mouthOpen', label: t => t('edit.visualEditor.params.mouthOpen'), type: 'text', visibleWhenContent: isImageContent, advanced: true, visibleWhen: { key: 'animationFlag', value: true } }),
      arg({ key: 'mouthHalfOpen', label: t => t('edit.visualEditor.params.mouthHalfOpen'), type: 'text', visibleWhenContent: isImageContent, advanced: true, visibleWhen: { key: 'animationFlag', value: true } }),
      arg({ key: 'mouthClose', label: t => t('edit.visualEditor.params.mouthClose'), type: 'text', visibleWhenContent: isImageContent, advanced: true, visibleWhen: { key: 'animationFlag', value: true } }),
      arg({ key: 'eyesOpen', label: t => t('edit.visualEditor.params.eyesOpen'), type: 'text', visibleWhenContent: isImageContent, advanced: true, visibleWhen: { key: 'animationFlag', value: true } }),
      arg({ key: 'eyesHalfOpen', label: t => t('edit.visualEditor.params.eyesHalfOpen'), type: 'text', visibleWhenContent: isImageContent, advanced: true, visibleWhen: { key: 'animationFlag', value: true } }),
      arg({ key: 'eyesClose', label: t => t('edit.visualEditor.params.eyesClose'), type: 'text', visibleWhenContent: isImageContent, advanced: true, visibleWhen: { key: 'animationFlag', value: true } }),
      arg({ key: 'bounds', label: t => t('edit.visualEditor.params.bounds'), type: 'text', visibleWhenContent: isLive2dContent, advanced: true }),
      arg({
        key: 'blink',
        label: t => t('edit.visualEditor.params.blink'),
        type: 'json-object',
        visibleWhenContent: isLive2dContent,
        advanced: true,
        fields: [
          { key: 'blinkInterval', label: t => t('edit.visualEditor.params.blinkInterval'), type: 'number', min: 0, unit: t => t('edit.visualEditor.params.unitMs') },
          { key: 'blinkIntervalRandom', label: t => t('edit.visualEditor.params.blinkIntervalRandom'), type: 'number', min: 0, placeholder: '1000', unit: t => t('edit.visualEditor.params.unitMs') },
          { key: 'openingDuration', label: t => t('edit.visualEditor.params.openingDuration'), type: 'number', min: 0, placeholder: '150', unit: t => t('edit.visualEditor.params.unitMs') },
          { key: 'closingDuration', label: t => t('edit.visualEditor.params.closingDuration'), type: 'number', min: 0, placeholder: '100', unit: t => t('edit.visualEditor.params.unitMs') },
          { key: 'closedDuration', label: t => t('edit.visualEditor.params.closedDuration'), type: 'number', min: 0, placeholder: '50', unit: t => t('edit.visualEditor.params.unitMs') },
        ],
      }),
      arg({
        key: 'focus',
        label: t => t('edit.visualEditor.params.focus'),
        type: 'json-object',
        visibleWhenContent: isLive2dContent,
        advanced: true,
        fields: [
          { key: 'x', label: t => t('edit.visualEditor.params.focusX'), type: 'number', placeholder: '0', min: -1, max: 1, scrubStep: 0.001, scrubbable: false, panelWidget: 'xy-pad', panelPairKey: 'y' },
          { key: 'y', label: t => t('edit.visualEditor.params.focusY'), type: 'number', placeholder: '0', min: -1, max: 1, scrubStep: 0.001, scrubbable: false, panelWidget: 'xy-pad', panelPairKey: 'x' },
          {
            key: 'instant',
            label: t => t('edit.visualEditor.params.focusInstant'),
            type: 'choice',
            options: [
              { label: t => t('edit.visualEditor.options.default'), value: UNSPECIFIED },
              { label: t => t('edit.visualEditor.options.animFlagOn'), value: '1' },
              { label: t => t('edit.visualEditor.options.animFlagOff'), value: '0' },
            ],
          },
        ],
      }),
      arg(NEXT),
    ],
  },
  {
    type: commandType.miniAvatar,
    label: t => t('edit.visualEditor.commands.miniAvatar'),
    icon: 'i-lucide-circle-user-round',
    category: 'media',
    fields: [
      content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'figure', extensions: IMAGE_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.miniAvatar') } }),
    ],
  },
  {
    type: commandType.bgm,
    label: t => t('edit.visualEditor.commands.bgm'),
    icon: 'i-lucide-music',
    category: 'media',
    fields: [
      content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'bgm', extensions: AUDIO_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.bgm') } }),
      arg(VOLUME),
      arg({ key: 'enter', label: t => t('edit.visualEditor.params.enter'), type: 'number', min: 0, unit: t => t('edit.visualEditor.params.unitMs') }),
      arg(UNLOCK_NAME),
      arg({ ...SERIES, visibleWhen: { key: 'unlockname', notEmpty: true } }),
    ],
  },
  {
    type: commandType.playEffect,
    label: t => t('edit.visualEditor.commands.playEffect'),
    icon: 'i-lucide-volume-2',
    category: 'media',
    fields: [
      content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'vocal', extensions: AUDIO_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.playEffect') } }),
      arg(VOLUME),
      arg(ID),
    ],
  },
  {
    type: commandType.video,
    label: t => t('edit.visualEditor.commands.video'),
    icon: 'i-lucide-film',
    category: 'media',
    fields: [
      content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'video', extensions: VIDEO_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.video') } }),
      arg({ key: 'skipOff', label: t => t('edit.visualEditor.params.skipOff'), type: 'switch', defaultValue: false }),
    ],
  },
]
