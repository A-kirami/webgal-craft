import { beforeAll, describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import {
  parseScene,
  parseSceneOrEmpty,
  parseSentence,
} from '~/helper/webgal-script/parser'

beforeAll(() => {
  ;(globalThis as { logger?: { error: (message: string) => void } }).logger = {
    error: () => {
      void 0
    },
  }
})

describe('WebGAL 解析辅助函数', () => {
  it('parseScene 会解析多行脚本', () => {
    const scene = parseScene('Alice:Hello -next;\nchangeBg:bg.jpg;')

    expect(scene?.sentenceList).toHaveLength(2)
    expect(scene?.sentenceList[0]?.command).toBe(commandType.say)
    expect(scene?.sentenceList[1]?.command).toBe(commandType.changeBg)
  })

  it('parseSentence 会返回首条语句', () => {
    const sentence = parseSentence('choose:A:scene1.txt|B:scene2.txt;')

    expect(sentence).toBeDefined()
    expect(sentence?.command).toBe(commandType.choose)
    expect(sentence?.content).toBe('A:scene1.txt|B:scene2.txt')
  })

  it('parseSceneOrEmpty 在空文本下会返回空场景对象', () => {
    const scene = parseSceneOrEmpty('')

    expect(scene.sentenceList).toHaveLength(1)
    expect(scene.sentenceList[0]?.content).toBe('')
  })
})
