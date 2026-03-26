import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { AUDIO_EXTENSIONS, BACKGROUND_EXTENSIONS, DEFAULT_ENTER_DURATION, DEFAULT_EXIT_DURATION, EFFECT_DURATION, EFFECT_EASE, EFFECT_TRANSFORM, ENTER_ANIMATION, EXIT_ANIMATION, FIGURE_EXTENSIONS, ID, IMAGE_EXTENSIONS, NEXT, SERIES, UNLOCK_NAME, VOLUME } from './common-params'
import { arg, commandRaw, content, UNSPECIFIED } from './schema'

import type { CommandEntry } from './schema'

function isLive2dContent(content: string): boolean {
  return content.endsWith('.json') && !content.includes('?type=spine')
}

// 判断 content 是否为动画类立绘（Live2D / Spine），用于控制 motion/expression 字段的可见性。
// 包含 .skel 和 ?type=spine：虽然 .skel 二进制格式无法提供动态选项的自动补全，
// 但仍需显示字段，确保用户在文本模式下写入的参数在可视化编辑器中可见。
function isAnimatedContent(content: string): boolean {
  return content.endsWith('.json') || content.endsWith('.skel') || content.includes('?type=spine')
}

function isSpineContent(content: string): boolean {
  return content.endsWith('.skel') || content.includes('?type=spine')
}

function isImageContent(content: string): boolean {
  return !!content && !isAnimatedContent(content)
}

export const performEntries: CommandEntry[] = [
  {
    type: commandType.say,
    label: t => t('edit.visualEditor.commands.say'),
    description: t => t('edit.visualEditor.commandDescriptions.say'),
    icon: 'i-lucide-message-circle',
    category: 'perform',
    fields: [
      commandRaw({ key: 'speaker', label: t => t('edit.visualEditor.params.speaker'), inlineLayout: 'standalone' }),
      content({
        key: 'text',
        label: t => t('edit.visualEditor.params.dialogue'),
        type: 'text',
        variant: { inline: 'textarea-auto', panel: 'textarea-grow' },
        inlineLayout: 'standalone',
      }),
      arg({
        key: 'fontSize',
        label: t => t('edit.visualEditor.params.fontSize'),
        type: 'choice',
        defaultValue: 'default',
        options: [
          { label: t => t('edit.visualEditor.options.default'), value: 'default' },
          { label: t => t('edit.visualEditor.options.small'), value: 'small' },
          { label: t => t('edit.visualEditor.options.medium'), value: 'medium' },
          { label: t => t('edit.visualEditor.options.large'), value: 'large' },
        ],
      }),
      arg({ key: 'vocal', label: t => t('edit.visualEditor.params.vocal'), type: 'file', fileConfig: { assetType: 'vocal', extensions: AUDIO_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.vocal') } }),
      arg({ ...VOLUME, visibleWhen: { key: 'vocal', notEmpty: true } }),
      arg({
        key: 'figurePosition',
        label: t => t('edit.visualEditor.params.associatedFigure'),
        type: 'choice',
        mode: 'flag',
        options: [
          { label: t => t('edit.visualEditor.options.unspecified'), value: UNSPECIFIED },
          { label: t => t('edit.visualEditor.options.figureLeft'), value: 'left' },
          { label: t => t('edit.visualEditor.options.figureCenter'), value: 'center' },
          { label: t => t('edit.visualEditor.options.figureRight'), value: 'right' },
          { label: t => t('edit.visualEditor.options.useFigureId'), value: 'id' },
        ],
      }),
      arg({ key: 'figureId', label: t => t('edit.visualEditor.params.associatedFigureId'), type: 'text', visibleWhen: { key: 'figurePosition', value: 'id' } }),
      arg({ key: 'concat', label: t => t('edit.visualEditor.params.concat'), type: 'switch', defaultValue: false }),
      arg({ key: 'notend', label: t => t('edit.visualEditor.params.notend'), type: 'switch', defaultValue: false }),
    ],
  },
  {
    type: commandType.changeBg,
    label: t => t('edit.visualEditor.commands.changeBg'),
    description: t => t('edit.visualEditor.commandDescriptions.changeBg'),
    icon: 'i-lucide-image',
    category: 'perform',
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
    description: t => t('edit.visualEditor.commandDescriptions.changeFigure'),
    icon: 'i-lucide-user',
    category: 'perform',
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
    description: t => t('edit.visualEditor.commandDescriptions.miniAvatar'),
    icon: 'i-lucide-circle-user-round',
    category: 'perform',
    fields: [
      content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'figure', extensions: IMAGE_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.miniAvatar') } }),
    ],
  },
  {
    type: commandType.bgm,
    label: t => t('edit.visualEditor.commands.bgm'),
    description: t => t('edit.visualEditor.commandDescriptions.bgm'),
    icon: 'i-lucide-music',
    category: 'perform',
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
    description: t => t('edit.visualEditor.commandDescriptions.playEffect'),
    icon: 'i-lucide-volume-2',
    category: 'perform',
    fields: [
      content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'vocal', extensions: AUDIO_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.playEffect') } }),
      arg(VOLUME),
      arg(ID),
    ],
  },
]
