import { ChoiceField, SwitchField, TextField } from '~/helper/command-registry/schema'

import type { NumberField } from '~/helper/command-registry/schema'

// ─── WebGAL 支持的文件扩展名 ───

export const AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.wav']
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv']
export const BACKGROUND_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, '.skel']
export const FIGURE_EXTENSIONS = [...IMAGE_EXTENSIONS, '.json', '.skel']

// ─── 通用参数预设（跨命令复用） ───

export const NEXT: SwitchField = { key: 'next', label: t => t('edit.visualEditor.params.next'), type: 'switch', defaultValue: false }
export const CONTINUE: SwitchField = { key: 'continue', label: t => t('edit.visualEditor.params.continue'), type: 'switch', defaultValue: false }
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
export const TARGET: ChoiceField = {
  key: 'target',
  label: t => t('edit.visualEditor.params.target'),
  type: 'choice',
  customizable: true,
  customLabel: t => t('edit.visualEditor.params.customTargetId'),
  options: [
    { label: t => t('edit.visualEditor.options.targetFigLeft'), value: 'fig-left' },
    { label: t => t('edit.visualEditor.options.targetFigCenter'), value: 'fig-center' },
    { label: t => t('edit.visualEditor.options.targetFigRight'), value: 'fig-right' },
    { label: t => t('edit.visualEditor.options.targetBgMain'), value: 'bg-main' },
    { label: t => t('edit.visualEditor.options.targetStageMain'), value: 'stage-main' },
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
export const ID: TextField = { key: 'id', label: t => t('edit.visualEditor.params.id'), type: 'text' }
export const WRITE_DEFAULT: SwitchField = { key: 'writeDefault', label: t => t('edit.visualEditor.params.writeDefault'), type: 'switch', defaultValue: false }
export const KEEP: SwitchField = { key: 'keep', label: t => t('edit.visualEditor.params.keep'), type: 'switch', defaultValue: false }

// ─── 效果编辑器托管的参数副本 ───

export const EFFECT_TRANSFORM: TextField = { ...TRANSFORM, managedByEffectEditor: true }
export const EFFECT_DURATION: NumberField = { ...DURATION, managedByEffectEditor: true }
export const EFFECT_EASE: ChoiceField = { ...EASE, managedByEffectEditor: true }

// ─── 入场/退场动画（高级参数） ───

export const ENTER_ANIMATION: ChoiceField = { key: 'enter', label: t => t('edit.visualEditor.params.enterAnimation'), type: 'choice', placeholder: t => t('edit.visualEditor.placeholder.searchAnimation'), dynamicOptionsKey: 'animationTableEntries', advanced: true, variant: 'combobox', options: [] }
export const EXIT_ANIMATION: ChoiceField = { key: 'exit', label: t => t('edit.visualEditor.params.exitAnimation'), type: 'choice', placeholder: t => t('edit.visualEditor.placeholder.searchAnimation'), dynamicOptionsKey: 'animationTableEntries', advanced: true, variant: 'combobox', options: [] }
export const DEFAULT_ENTER_DURATION: NumberField = { key: 'enterDuration', label: t => t('edit.visualEditor.params.defaultEnterDuration'), type: 'number', min: 0, unit: t => t('edit.visualEditor.params.unitMs'), advanced: true, visibleWhen: { key: 'enter', empty: true } }
export const DEFAULT_EXIT_DURATION: NumberField = { key: 'exitDuration', label: t => t('edit.visualEditor.params.defaultExitDuration'), type: 'number', min: 0, unit: t => t('edit.visualEditor.params.unitMs'), advanced: true, visibleWhen: { key: 'exit', empty: true } }
