import { describe, expect, it } from 'vitest'

import { resolveAutocompleteOptions } from '~/features/editor/statement-editor/autocomplete-options'
import { EMPTY_SCENE_AUTOCOMPLETE_OPTIONS } from '~/features/editor/statement-editor/scene-autocomplete'

const identityTranslate = (key: string): string => key

describe('resolveAutocompleteOptions', () => {
  it('单一静态来源返回无分组的本地化候选', () => {
    const sources = [{
      type: 'static',
      options: [
        { label: 'effect.rain', value: 'rain' },
        { label: 'effect.snow', value: 'snow' },
      ],
    }] as const

    expect(resolveAutocompleteOptions(sources, {
      content: '',
      sceneOptions: EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
      t: identityTranslate,
    })).toEqual([
      { label: 'effect.rain', value: 'rain' },
      { label: 'effect.snow', value: 'snow' },
    ])
  })

  it('按声明顺序合并静态与场景来源并由前序来源优先去重', () => {
    const sources = [
      {
        type: 'static',
        groupLabel: 'groups.preset',
        options: [
          { label: 'targets.left', value: 'fig-left' },
          { label: 'targets.stage', value: 'stage-main' },
        ],
      },
      {
        type: 'scene',
        collection: 'figureIds',
        groupLabel: 'groups.figureId',
      },
    ] as const

    expect(resolveAutocompleteOptions(sources, {
      content: '',
      sceneOptions: {
        ...EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
        figureIds: [
          { label: 'fig-left', value: 'fig-left' },
          { label: 'hero', value: 'hero' },
        ],
      },
      t: identityTranslate,
    })).toEqual([
      { group: 'groups.preset', label: 'targets.left', value: 'fig-left' },
      { group: 'groups.preset', label: 'targets.stage', value: 'stage-main' },
      { group: 'groups.figureId', label: 'hero', value: 'hero' },
    ])
  })

  it('忽略所有来源中的空值候选', () => {
    const sources = [
      {
        type: 'static',
        options: [{ label: 'empty', value: '' }],
      },
      {
        type: 'scene',
        collection: 'sceneLabels',
      },
    ] as const

    expect(resolveAutocompleteOptions(sources, {
      sceneOptions: {
        ...EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
        sceneLabels: [{ label: 'empty', value: '' }],
      },
      t: identityTranslate,
    })).toEqual([])
  })
})
