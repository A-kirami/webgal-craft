import { describe, expect, it } from 'vitest'

import { buildStatements } from '~/domain/script/sentence'

import {
  buildSceneAutocompleteOptionsFromStatements,
  buildSceneAutocompleteOptionsFromText,
} from '../scene-autocomplete'

describe('buildSceneAutocompleteOptionsFromText', () => {
  it('按语义提取去重后的候选项', () => {
    const options = buildSceneAutocompleteOptionsFromText([
      'changeFigure: hero.png -id=hero;',
      'playEffect: beep.ogg -id=fx-main;',
      'changeFigure: another.png -id=hero;',
      'label: start;',
      'jumpLabel: start;',
      'label: next;',
    ].join('\n'))

    expect(options.figureIds).toEqual([
      { label: 'hero', value: 'hero' },
    ])
    expect(options.soundEffectIds).toEqual([
      { label: 'fx-main', value: 'fx-main' },
    ])
    expect(options.sceneLabels).toEqual([
      { label: 'start', value: 'start' },
      { label: 'next', value: 'next' },
    ])
  })
})

describe('buildSceneAutocompleteOptionsFromStatements', () => {
  it('从 StatementEntry 列表提取候选项并忽略空值', () => {
    const statements = buildStatements([
      'changeFigure: hero.png -id=hero;',
      'changeFigure: anonymous.png -id;',
      'playEffect: beep.ogg -id=fx-main;',
      'label: start;',
      'label: ;',
    ].join('\n'))

    const options = buildSceneAutocompleteOptionsFromStatements(statements)

    expect(options.figureIds).toEqual([{ label: 'hero', value: 'hero' }])
    expect(options.soundEffectIds).toEqual([{ label: 'fx-main', value: 'fx-main' }])
    expect(options.sceneLabels).toEqual([{ label: 'start', value: 'start' }])
  })
})
