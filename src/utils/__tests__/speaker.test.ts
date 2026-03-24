import { describe, expect, it } from 'vitest'

import {
  buildPreviousSpeakers,
  extractSpeakerChange,
  getPreviousSpeakerAtIndex,
  getPreviousSpeakerAtLine,
} from '~/utils/speaker'

describe('extractSpeakerChange', () => {
  describe('注释行', () => {
    it('跳过纯注释行', () => {
      expect(extractSpeakerChange(';这是注释')).toBeUndefined()
    })

    it('跳过含冒号的注释行', () => {
      expect(extractSpeakerChange(';xxx:yyy;')).toBeUndefined()
    })

    it('跳过空注释', () => {
      expect(extractSpeakerChange(';')).toBeUndefined()
    })
  })

  describe('简写格式', () => {
    it('角色名:对话 → 说话人', () => {
      expect(extractSpeakerChange('角色A:这是一句话。;')).toBe('角色A')
    })

    it(':对话 → 旁白', () => {
      expect(extractSpeakerChange(':这是一句旁白。;')).toBe('')
    })

    it('无冒号 → 继承（返回 null）', () => {
      expect(extractSpeakerChange('这是一句话。;')).toBeUndefined()
    })

    it('英文角色名', () => {
      expect(extractSpeakerChange('Alice:Hello!;')).toBe('Alice')
    })
  })

  describe('标准 say 写法', () => {
    it('say: -speaker=角色A → 说话人 A', () => {
      expect(extractSpeakerChange('say:这是一句话。 -speaker=角色A;')).toBe('角色A')
    })

    it('say: -clear → 旁白', () => {
      expect(extractSpeakerChange('say:这是一个旁白。 -clear;')).toBe('')
    })

    it('say: 无参数 → 继承', () => {
      expect(extractSpeakerChange('say:这是一句话。;')).toBeUndefined()
    })

    it('say: 空内容 → 继承', () => {
      expect(extractSpeakerChange('say:;')).toBeUndefined()
    })

    it('say: -speaker 在多个参数中', () => {
      expect(extractSpeakerChange('say:对话。 -speaker=角色B -concat;')).toBe('角色B')
    })

    it('say: -clear 后跟空格和其他参数', () => {
      expect(extractSpeakerChange('say:旁白。 -clear -concat;')).toBe('')
    })

    it('say: -clear 在行尾无分号', () => {
      expect(extractSpeakerChange('say:旁白。 -clear')).toBe('')
    })
  })

  describe('其他命令不影响说话人', () => {
    it('changeBg 命令 → 继承', () => {
      expect(extractSpeakerChange('changeBg:bg.png;')).toBeUndefined()
    })

    it('bgm 命令 → 继承', () => {
      expect(extractSpeakerChange('bgm:music.mp3;')).toBeUndefined()
    })

    it('setVar 命令 → 继承', () => {
      expect(extractSpeakerChange('setVar:a=1;')).toBeUndefined()
    })
  })
})

describe('说话人辅助函数', () => {
  const entries = [
    { rawText: 'Alice:你好;' },
    { rawText: '接续上一句;' },
    { rawText: 'say:旁白。 -clear;' },
    { rawText: '继续旁白;' },
    { rawText: 'say:切回角色。 -speaker=Bob;' },
  ]

  it('批量构建 previous speaker 列表', () => {
    expect(buildPreviousSpeakers(entries)).toEqual([
      '',
      'Alice',
      'Alice',
      '',
      '',
    ])
  })

  it('按索引读取上一位说话人', () => {
    expect(getPreviousSpeakerAtIndex(entries, 0)).toBe('')
    expect(getPreviousSpeakerAtIndex(entries, 2)).toBe('Alice')
    expect(getPreviousSpeakerAtIndex(entries, 4)).toBe('')
  })

  it('按行号读取上一位说话人', () => {
    const lines = entries.map(entry => entry.rawText)
    expect(getPreviousSpeakerAtLine(1, lineNumber => lines[lineNumber - 1] ?? '')).toBe('')
    expect(getPreviousSpeakerAtLine(3, lineNumber => lines[lineNumber - 1] ?? '')).toBe('Alice')
    expect(getPreviousSpeakerAtLine(5, lineNumber => lines[lineNumber - 1] ?? '')).toBe('')
  })
})
