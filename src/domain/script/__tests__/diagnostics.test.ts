import { describe, expect, it } from 'vitest'

import { parseSentence } from '~/domain/script/parser'

import { diagnoseDuplicateSceneLabels, diagnoseMissingSceneLabels } from '../diagnostics'

describe('diagnoseMissingSceneLabels', () => {
  it('标记不存在的跳转目标并允许向前引用', () => {
    const sentences = [
      parseSentence('jumpLabel:later;'),
      parseSentence('jumpLabel:missing;'),
      parseSentence('label:later;'),
      parseSentence('jumpLabel:;'),
      undefined,
    ]

    expect(diagnoseMissingSceneLabels(sentences)).toEqual([
      { label: 'missing', statementIndex: 1 },
    ])
  })

  it('按大小写精确匹配标签名', () => {
    const sentences = [
      parseSentence('label:start;'),
      parseSentence('jumpLabel:Start;'),
    ]

    expect(diagnoseMissingSceneLabels(sentences)).toEqual([
      { label: 'Start', statementIndex: 1 },
    ])
  })
})

describe('diagnoseDuplicateSceneLabels', () => {
  it('标记场景中同名标签的全部定义', () => {
    const sentences = [
      parseSentence('label: start;'),
      parseSentence('say:hello;'),
      parseSentence('label:start;'),
      parseSentence('label: end;'),
      parseSentence('label: start;'),
    ]

    expect(diagnoseDuplicateSceneLabels(sentences)).toEqual([
      { count: 3, label: 'start', statementIndex: 0 },
      { count: 3, label: 'start', statementIndex: 2 },
      { count: 3, label: 'start', statementIndex: 4 },
    ])
  })

  it('忽略空标签并按大小写精确区分标签名', () => {
    const sentences = [
      parseSentence('label: ;'),
      parseSentence('label:start;'),
      parseSentence('label:Start;'),
      undefined,
    ]

    expect(diagnoseDuplicateSceneLabels(sentences)).toEqual([])
  })
})
