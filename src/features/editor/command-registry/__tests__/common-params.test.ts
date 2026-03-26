import { describe, expect, it } from 'vitest'

import {
  AUDIO_EXTENSIONS,
  BACKGROUND_EXTENSIONS,
  DEFAULT_ENTER_DURATION,
  DEFAULT_EXIT_DURATION,
  DURATION,
  EASE,
  EFFECT_DURATION,
  EFFECT_EASE,
  EFFECT_TRANSFORM,
  ENTER_ANIMATION,
  EXIT_ANIMATION,
  FIGURE_EXTENSIONS,
  IMAGE_EXTENSIONS,
  TARGET,
  TRANSFORM,
  VIDEO_EXTENSIONS,
} from '~/features/editor/command-registry/common-params'

describe('命令注册表通用参数', () => {
  it('背景与立绘扩展名集合覆盖预期资源类型', () => {
    expect(AUDIO_EXTENSIONS).toEqual(expect.arrayContaining(['.mp3', '.ogg', '.wav']))
    expect(IMAGE_EXTENSIONS).toEqual(expect.arrayContaining(['.png', '.jpg', '.jpeg', '.gif', '.webp']))
    expect(VIDEO_EXTENSIONS).toEqual(expect.arrayContaining(['.mp4', '.webm', '.mkv']))
    expect(BACKGROUND_EXTENSIONS).toEqual(expect.arrayContaining(['.png', '.mp4', '.skel']))
    expect(FIGURE_EXTENSIONS).toEqual(expect.arrayContaining(['.png', '.json', '.skel']))
  })

  it('TARGET 是可自定义的 choice 参数，并提供内置目标位点', () => {
    expect(TARGET.type).toBe('choice')
    if (TARGET.type !== 'choice') {
      throw new TypeError('expected TARGET to be a choice field')
    }

    expect(TARGET.customizable).toBe(true)
    expect(TARGET.options.map(option => option.value)).toEqual([
      'fig-left',
      'fig-center',
      'fig-right',
      'bg-main',
      'stage-main',
    ])
  })

  it('效果编辑器托管参数复用原 key，并额外标记 managedByEffectEditor', () => {
    expect(EFFECT_TRANSFORM).toMatchObject({
      key: TRANSFORM.key,
      managedByEffectEditor: true,
    })
    expect(EFFECT_DURATION).toMatchObject({
      key: DURATION.key,
      managedByEffectEditor: true,
    })
    expect(EFFECT_EASE).toMatchObject({
      key: EASE.key,
      managedByEffectEditor: true,
    })
  })

  it('入场退场动画参数和默认时长字段保持成对配置', () => {
    expect(ENTER_ANIMATION).toMatchObject({
      key: 'enter',
      type: 'choice',
      dynamicOptionsKey: 'animationTableEntries',
      advanced: true,
      variant: 'combobox',
    })
    expect(EXIT_ANIMATION).toMatchObject({
      key: 'exit',
      type: 'choice',
      dynamicOptionsKey: 'animationTableEntries',
      advanced: true,
      variant: 'combobox',
    })
    expect(DEFAULT_ENTER_DURATION).toMatchObject({
      key: 'enterDuration',
      advanced: true,
      visibleWhen: { key: ENTER_ANIMATION.key, empty: true },
    })
    expect(DEFAULT_EXIT_DURATION).toMatchObject({
      key: 'exitDuration',
      advanced: true,
      visibleWhen: { key: EXIT_ANIMATION.key, empty: true },
    })
  })
})
