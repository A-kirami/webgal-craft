import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { SAY_CONTINUATION_RAW } from '~/domain/script/codec'
import { serializeSentence } from '~/domain/script/serialize'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

function createSentence(overrides: Partial<ISentence>): ISentence {
  return {
    command: commandType.say,
    commandRaw: 'say',
    content: 'hello',
    args: [],
    inlineComment: '',
    ...overrides,
  } as ISentence
}

describe('serializeSentence 序列化', () => {
  it('comment 语句会序列化为注释格式', () => {
    expect(serializeSentence(createSentence({
      command: commandType.comment,
      content: 'comment line',
    }))).toBe(';comment line')
  })

  it('普通命令会保留布尔参数、行内注释，并转义内容中的分号', () => {
    expect(serializeSentence(createSentence({
      command: commandType.changeBg,
      commandRaw: 'changeBg',
      content: 'bg;intro.png',
      inlineComment: 'after',
      args: [
        { key: 'next', value: true },
        { key: 'duration', value: '300' },
      ],
    }))).toBe(String.raw`changeBg:bg\;intro.png -next -duration=300;after`)
  })

  it('say 简写会过滤已经编码到 commandRaw 里的 speaker', () => {
    expect(serializeSentence(createSentence({
      commandRaw: 'Alice',
      args: [
        { key: 'speaker', value: 'Alice' },
        { key: 'next', value: true },
      ],
    }))).toBe('Alice:hello -next;')
  })

  it('say 语音参数会序列化为简写文件参数', () => {
    expect(serializeSentence(createSentence({
      commandRaw: '角色A',
      args: [
        { key: 'vocal', value: 'hello_world.wav' },
        { key: 'volume', value: 80 },
      ],
      content: '你好，世界！',
    }))).toBe('角色A:你好，世界！ -hello_world.wav -volume=80;')
  })

  it('say 续写语句会省略冒号前缀', () => {
    expect(serializeSentence(createSentence({
      commandRaw: SAY_CONTINUATION_RAW,
      content: 'continued text',
    }))).toBe('continued text;')
  })

  it('say 续写语句带行内注释时不会在注释后追加分号', () => {
    expect(serializeSentence(createSentence({
      commandRaw: SAY_CONTINUATION_RAW,
      content: 'continued text',
      inlineComment: 'note',
    }))).toBe('continued text;note')
  })

  it('空内容的 say 续写语句会回退到显式 say 形式', () => {
    expect(serializeSentence(createSentence({
      commandRaw: SAY_CONTINUATION_RAW,
      content: '',
    }))).toBe('say:;')
  })
})
