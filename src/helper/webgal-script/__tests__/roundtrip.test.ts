import { beforeAll, describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import {
  parseChooseContent,
  parseSetVarContent,
  parseStyleRuleContent,
  stringifyChooseContent,
  stringifySetVarContent,
  stringifyStyleRuleContent,
} from '../content'
import { parseSentence } from '../parser'
import {
  buildSceneStatements,
  buildStatements,
  createEmptySentence,
  joinStatements,
  rebuildStatementsWithStableIds,
  splitStatements,
} from '../sentence'
import { serializeSentence } from '../serialize'

interface SentenceFixture {
  name: string
  raw: string
  expectedCommand: commandType
}

const SENTENCE_FIXTURES: SentenceFixture[] = [
  { name: 'say-with-speaker-and-flag', raw: 'Alice: Hello world -next;', expectedCommand: commandType.say },
  { name: 'say-narration', raw: ': narration line;', expectedCommand: commandType.say },
  { name: 'comment', raw: '; this is comment', expectedCommand: commandType.comment },
  { name: 'choose', raw: 'choose: A:scene1.txt|B:scene2.txt;', expectedCommand: commandType.choose },
  { name: 'apply-style', raw: 'applyStyle: old->new,foo->bar;', expectedCommand: commandType.applyStyle },
  { name: 'set-var', raw: 'setVar: score=10;', expectedCommand: commandType.setVar },
  { name: 'change-bg', raw: 'changeBg: bg.jpg -next -duration=300;', expectedCommand: commandType.changeBg },
]

function pickComparableSentenceFields(sentence: NonNullable<ReturnType<typeof parseSentence>>) {
  return {
    command: sentence.command,
    commandRaw: sentence.commandRaw,
    content: sentence.content,
    args: sentence.args,
    inlineComment: sentence.inlineComment,
  }
}

beforeAll(() => {
  ;(globalThis as { logger?: { error: (message: string) => void } }).logger = {
    // 测试环境只需要吞掉日志，避免未注入 logger 时抛错
    error: () => {
      void 0
    },
  }
})

describe('WebGAL 脚本语句往返测试', () => {
  for (const fixture of SENTENCE_FIXTURES) {
    it(`可以解析 fixture：${fixture.name}`, () => {
      const parsed = parseSentence(fixture.raw)
      expect(parsed).toBeDefined()
      expect(parsed!.command).toBe(fixture.expectedCommand)
    })

    it(`parse -> serialize -> parse 后保持语义不变：${fixture.name}`, () => {
      const first = parseSentence(fixture.raw)
      expect(first).toBeDefined()

      const serialized = serializeSentence(first!)
      const second = parseSentence(serialized)
      expect(second).toBeDefined()

      expect(pickComparableSentenceFields(second!)).toEqual(pickComparableSentenceFields(first!))
    })
  }
})

describe('内容解析器/序列化器', () => {
  it('setVar 往返测试', () => {
    const content = 'score=10'
    const parsed = parseSetVarContent(content)
    expect(parsed).toEqual({ name: 'score', value: '10' })
    expect(stringifySetVarContent(parsed.name, parsed.value)).toBe(content)
  })

  it('choose 往返测试', () => {
    const content = 'A:scene1.txt|B:scene2.txt'
    const parsed = parseChooseContent(content)
    expect(parsed).toEqual([
      { name: 'A', file: 'scene1.txt' },
      { name: 'B', file: 'scene2.txt' },
    ])
    expect(stringifyChooseContent(parsed)).toBe(content)
  })

  it('applyStyle 往返测试', () => {
    const content = 'old->new,foo->bar'
    const parsed = parseStyleRuleContent(content)
    expect(parsed).toEqual([
      { oldName: 'old', newName: 'new' },
      { oldName: 'foo', newName: 'bar' },
    ])
    expect(stringifyStyleRuleContent(parsed)).toBe(content)
  })
})

describe('语句列表辅助函数', () => {
  it('split/build/join 保持行边界', () => {
    const raw = 'a\nb\nc'
    expect(splitStatements(raw)).toEqual(['a', 'b', 'c'])

    const entries = buildStatements(raw)
    expect(entries).toHaveLength(3)
    expect(entries.map(entry => entry.rawText)).toEqual(['a', 'b', 'c'])
    expect(joinStatements(entries)).toBe(raw)
  })

  it('createEmptySentence 序列化为规范的空 say 语句', () => {
    expect(serializeSentence(createEmptySentence())).toBe(':;')
  })

  it('rebuildStatementsWithStableIds 会保留未改动语句的稳定 id', () => {
    const previousEntries = buildStatements('alpha\nbeta\ngamma')
    const nextEntries = rebuildStatementsWithStableIds(previousEntries, 'alpha!\nbeta\ngamma')

    expect(nextEntries[1]?.id).toBe(previousEntries[1]?.id)
    expect(nextEntries[2]?.id).toBe(previousEntries[2]?.id)
  })

  it('buildSceneStatements 返回纯文档语句，不携带解析缓存字段', () => {
    const [statement] = buildSceneStatements('Alice:Hello;')

    expect(statement).toEqual({
      id: expect.any(Number),
      rawText: 'Alice:Hello;',
    })
    expect('parsed' in (statement as object)).toBe(false)
    expect('parseError' in (statement as object)).toBe(false)
  })
})
