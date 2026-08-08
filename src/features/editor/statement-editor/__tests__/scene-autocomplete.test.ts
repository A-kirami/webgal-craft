import { describe, expect, it } from 'vitest'

import { LEGACY_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { buildStatements } from '~/domain/script/sentence'

import { buildSceneAutocompleteOptionsFromStatements, buildSceneAutocompleteOptionsFromText } from '../scene-autocomplete'

describe('buildSceneAutocompleteOptionsFromStatements', () => {
  it('从显式说话人构建去重且顺序稳定的候选项', () => {
    const statements = buildStatements([
      ' Alice : first;',
      'say: second -speaker=Bob;',
      'Alice: duplicate;',
      ': narration;',
      'say: inherited;',
      'continued dialogue;',
      'say: cleared -speaker=Carol -clear;',
    ].join('\n'))

    expect(buildSceneAutocompleteOptionsFromStatements(statements).speakers).toEqual([
      { label: 'Alice', value: 'Alice' },
      { label: 'Bob', value: 'Bob' },
    ])
  })

  it('按语义提取去重后的候选项', () => {
    const statements = buildStatements([
      'changeFigure: hero.png -id=hero;',
      'playEffect: beep.ogg -id=fx-main;',
      'changeFigure: another.png -id=hero;',
      'label: start;',
      'jumpLabel: start;',
      'label: next;',
    ].join('\n'))
    const options = buildSceneAutocompleteOptionsFromStatements(statements)

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

describe('buildSceneAutocompleteOptionsFromText', () => {
  it('从纯文本构建候选而不要求创建语句条目', () => {
    expect(buildSceneAutocompleteOptionsFromText('Alice:hello;\nlabel:start;\nchangeFigure:hero -id=hero-id;')).toEqual({
      figureIds: [{ label: 'hero-id', value: 'hero-id' }],
      sceneLabels: [{ label: 'start', value: 'start' }],
      soundEffectIds: [],
      speakers: [{ label: 'Alice', value: 'Alice' }],
    })
  })

  it('按运行时能力解析文本，旧运行时将 return 保持为对白', () => {
    expect(buildSceneAutocompleteOptionsFromText('return:success;').speakers).toEqual([])
    expect(buildSceneAutocompleteOptionsFromText('return:success;', LEGACY_ENGINE_RUNTIME_CAPABILITIES).speakers).toEqual([
      { label: 'return', value: 'return' },
    ])
  })
})
