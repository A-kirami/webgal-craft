import { describe, expect, it } from 'vitest'

import {
  parseChooseContent,
  parseSetVarContent,
  parseStyleRuleContent,
  stringifyChooseContent,
  stringifySetVarContent,
  stringifyStyleRuleContent,
} from '~/helper/webgal-script/content'

describe('WebGAL 内容辅助函数', () => {
  it('setVar 内容支持解析和序列化', () => {
    expect(parseSetVarContent('score=10')).toEqual({
      name: 'score',
      value: '10',
    })
    expect(stringifySetVarContent('score', '20')).toBe('score=20')
  })

  it('choose 内容会忽略空项并保留缺失 file 的分支', () => {
    const parsed = parseChooseContent('A:scene-1.txt|B:|single')

    expect(parsed).toEqual([
      { name: 'A', file: 'scene-1.txt' },
      { name: 'B', file: '' },
      { name: 'single', file: '' },
    ])
    expect(stringifyChooseContent(parsed)).toBe('A:scene-1.txt|B:|single:')
  })

  it('style rule 内容支持逗号分隔的往返', () => {
    const parsed = parseStyleRuleContent('old->new,foo->bar')

    expect(parsed).toEqual([
      { oldName: 'old', newName: 'new' },
      { oldName: 'foo', newName: 'bar' },
    ])
    expect(stringifyStyleRuleContent(parsed)).toBe('old->new,foo->bar')
  })
})
