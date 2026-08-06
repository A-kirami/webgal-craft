import { FIGURE_POSITION_TARGET_IDS } from '~/domain/script/types'

import type { AutocompleteTextField, ChoiceField, NumberField, ResourceReferenceConfig, SwitchField, TextField } from '~/features/editor/command-registry/schema'

// ─── WebGAL 支持的文件扩展名 ───

export const AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.opus']
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv']
export const BACKGROUND_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, '.skel']
export const FIGURE_EXTENSIONS = [...IMAGE_EXTENSIONS, '.json', '.skel']
export const ANIMATION_RESOURCE_REFERENCE: ResourceReferenceConfig = { assetType: 'animation' }

// ─── 通用参数预设（跨命令复用） ───

export const NEXT: SwitchField = { key: 'next', label: t => t('edit.visualEditor.params.next'), tooltip: { on: t => t('edit.visualEditor.paramTooltips.next.on'), off: t => t('edit.visualEditor.paramTooltips.next.off') }, type: 'switch', defaultValue: false }
export const CONTINUE: SwitchField = { key: 'continue', label: t => t('edit.visualEditor.params.continue'), tooltip: { on: t => t('edit.visualEditor.paramTooltips.continue.on'), off: t => t('edit.visualEditor.paramTooltips.continue.off') }, type: 'switch', defaultValue: false }
export const DURATION: NumberField = { key: 'duration', label: t => t('edit.visualEditor.params.duration'), type: 'number', min: 0, unit: t => t('edit.visualEditor.params.unitMs') }
export const EASE: ChoiceField = {
  key: 'ease',
  label: t => t('edit.visualEditor.params.ease'),
  type: 'choice',
  options: [
    { label: t => t('edit.visualEditor.options.easeLinear'), value: 'linear' },
    { label: t => t('edit.visualEditor.options.easeIn'), value: 'easeIn' },
    { label: t => t('edit.visualEditor.options.easeOut'), value: 'easeOut' },
    { label: t => t('edit.visualEditor.options.easeInOut'), value: 'easeInOut' },
    { label: t => t('edit.visualEditor.options.easeCircIn'), value: 'circIn' },
    { label: t => t('edit.visualEditor.options.easeCircOut'), value: 'circOut' },
    { label: t => t('edit.visualEditor.options.easeCircInOut'), value: 'circInOut' },
    { label: t => t('edit.visualEditor.options.easeBackIn'), value: 'backIn' },
    { label: t => t('edit.visualEditor.options.easeBackOut'), value: 'backOut' },
    { label: t => t('edit.visualEditor.options.easeBackInOut'), value: 'backInOut' },
    { label: t => t('edit.visualEditor.options.easeBounceIn'), value: 'bounceIn' },
    { label: t => t('edit.visualEditor.options.easeBounceOut'), value: 'bounceOut' },
    { label: t => t('edit.visualEditor.options.easeBounceInOut'), value: 'bounceInOut' },
    { label: t => t('edit.visualEditor.options.easeAnticipate'), value: 'anticipate' },
  ],
}
export const TRANSFORM: TextField = { key: 'transform', label: t => t('edit.visualEditor.params.transform'), type: 'text' }
export const TARGET: AutocompleteTextField = {
  key: 'target',
  label: t => t('edit.visualEditor.params.target'),
  type: 'text',
  variant: 'autocomplete',
  autocomplete: [
    {
      type: 'static',
      groupLabel: t => t('edit.visualEditor.autocompleteGroups.preset'),
      options: [
        { label: t => t('edit.visualEditor.options.targetFigLeft'), value: FIGURE_POSITION_TARGET_IDS.left },
        { label: t => t('edit.visualEditor.options.targetFigCenter'), value: FIGURE_POSITION_TARGET_IDS.center },
        { label: t => t('edit.visualEditor.options.targetFigRight'), value: FIGURE_POSITION_TARGET_IDS.right },
        { label: t => t('edit.visualEditor.options.targetBgMain'), value: 'bg-main' },
        { label: t => t('edit.visualEditor.options.targetStageMain'), value: 'stage-main' },
      ],
    },
    {
      type: 'scene',
      collection: 'figureIds',
      groupLabel: t => t('edit.visualEditor.params.associatedFigureId'),
    },
  ],
}
export const VOLUME: NumberField = {
  key: 'volume',
  label: t => t('edit.visualEditor.params.volume'),
  type: 'number',
  min: 0,
  max: 100,
  defaultValue: 100,
  variant: { panel: 'slider-input' },
}
export const UNLOCK_NAME: TextField = { key: 'unlockname', label: t => t('edit.visualEditor.params.unlockname'), type: 'text' }
export const SERIES: TextField = { key: 'series', label: t => t('edit.visualEditor.params.series'), type: 'text' }
export const FIGURE_ID: AutocompleteTextField = { key: 'id', label: t => t('edit.visualEditor.params.id'), type: 'text', variant: 'autocomplete', autocomplete: [{ type: 'scene', collection: 'figureIds' }] }
export const SOUND_EFFECT_ID: AutocompleteTextField = { key: 'id', label: t => t('edit.visualEditor.params.id'), type: 'text', variant: 'autocomplete', autocomplete: [{ type: 'scene', collection: 'soundEffectIds' }] }
export const WRITE_DEFAULT: SwitchField = { key: 'writeDefault', label: t => t('edit.visualEditor.params.writeDefault'), tooltip: { on: t => t('edit.visualEditor.paramTooltips.writeDefault.on'), off: t => t('edit.visualEditor.paramTooltips.writeDefault.off') }, type: 'switch', defaultValue: false }
export const KEEP: SwitchField = { key: 'keep', label: t => t('edit.visualEditor.params.keep'), tooltip: { on: t => t('edit.visualEditor.paramTooltips.keep.on'), off: t => t('edit.visualEditor.paramTooltips.keep.off') }, type: 'switch', defaultValue: false }
export const PARALLEL: SwitchField = { key: 'parallel', label: t => t('edit.visualEditor.params.parallel'), tooltip: { on: t => t('edit.visualEditor.paramTooltips.parallel.on'), off: t => t('edit.visualEditor.paramTooltips.parallel.off') }, type: 'switch', defaultValue: false }
export const IGNORE_DEFAULT: SwitchField = { key: 'ignoreDefault', label: t => t('edit.visualEditor.params.ignoreDefault'), tooltip: { on: t => t('edit.visualEditor.paramTooltips.ignoreDefault.on'), off: t => t('edit.visualEditor.paramTooltips.ignoreDefault.off') }, type: 'switch', defaultValue: false }
export const ORDER: NumberField = { key: 'order', label: t => t('edit.visualEditor.params.order'), type: 'number' }

// ─── 效果编辑器托管的参数副本 ───

export const EFFECT_TRANSFORM: TextField = { ...TRANSFORM, managedByEffectEditor: true }
export const EFFECT_DURATION: NumberField = { ...DURATION, managedByEffectEditor: true }
export const EFFECT_EASE: ChoiceField = { ...EASE, managedByEffectEditor: true }

// ─── 入场/退场动画（高级参数） ───

export const ENTER_ANIMATION: ChoiceField = { key: 'enter', label: t => t('edit.visualEditor.params.enterAnimation'), type: 'choice', resourceReference: ANIMATION_RESOURCE_REFERENCE, placeholder: t => t('edit.visualEditor.placeholder.searchAnimation'), dynamicOptionsKey: 'animationTableEntries', grouping: { mode: 'path' }, advanced: true, variant: 'combobox', options: [] }
export const EXIT_ANIMATION: ChoiceField = { key: 'exit', label: t => t('edit.visualEditor.params.exitAnimation'), type: 'choice', resourceReference: ANIMATION_RESOURCE_REFERENCE, placeholder: t => t('edit.visualEditor.placeholder.searchAnimation'), dynamicOptionsKey: 'animationTableEntries', grouping: { mode: 'path' }, advanced: true, variant: 'combobox', options: [] }
export const DEFAULT_ENTER_DURATION: NumberField = { key: 'enterDuration', label: t => t('edit.visualEditor.params.defaultEnterDuration'), type: 'number', min: 0, unit: t => t('edit.visualEditor.params.unitMs'), advanced: true, visibleWhen: { key: 'enter', empty: true } }
export const DEFAULT_EXIT_DURATION: NumberField = { key: 'exitDuration', label: t => t('edit.visualEditor.params.defaultExitDuration'), type: 'number', min: 0, unit: t => t('edit.visualEditor.params.unitMs'), advanced: true, visibleWhen: { key: 'exit', empty: true } }
