import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseSentence } from '../parser'

describe('say 形式解析检查', () => {
  it('say:xxxxxx; 解析结果', () => {
    const s = parseSentence('say:xxxxxx;')
    expect(s).toBeDefined()
    expect(s!.command).toBe(commandType.say)
    expect(s!.commandRaw).toBe('say')
    expect(s!.content).toBe('xxxxxx')
  })

  it('xxxxxx; 解析结果', () => {
    const s = parseSentence('xxxxxx;')
    expect(s).toBeDefined()
    expect(s!.command).toBe(commandType.say)
    expect(s!.commandRaw).toBe('xxxxxx')
    expect(s!.content).toBe('xxxxxx')
  })

  it(':xxxxxx; 解析结果', () => {
    const s = parseSentence(':xxxxxx;')
    expect(s).toBeDefined()
    expect(s!.command).toBe(commandType.say)
    expect(s!.commandRaw).toBe('')
    expect(s!.content).toBe('xxxxxx')
  })

  it('Alice:xxxxxx; 解析结果', () => {
    const s = parseSentence('Alice:xxxxxx;')
    expect(s).toBeDefined()
    expect(s!.command).toBe(commandType.say)
    expect(s!.commandRaw).toBe('Alice')
    expect(s!.content).toBe('xxxxxx')
  })

  it('say 语音简写会归一化为 vocal 参数', () => {
    const s = parseSentence('角色A:你好，世界！ -hello_world.wav;')
    expect(s).toBeDefined()
    expect(s!.command).toBe(commandType.say)
    expect(s!.commandRaw).toBe('角色A')
    expect(s!.content).toBe('你好，世界！')
    expect(s!.args).toEqual(expect.arrayContaining([{ key: 'vocal', value: 'hello_world.wav' }]))
  })
})
