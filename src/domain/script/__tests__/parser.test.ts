import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { LEGACY_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { parseScene, parseSceneOrEmpty, parseSentence } from '~/domain/script/parser'

const parserLoggerTarget = globalThis as { logger?: { error: (message: string) => void } }
const originalLogger = parserLoggerTarget.logger

beforeAll(() => {
  parserLoggerTarget.logger = {
    error: () => {
      void 0
    },
  }
})

afterAll(() => {
  if (originalLogger === undefined) {
    delete parserLoggerTarget.logger
    return
  }

  parserLoggerTarget.logger = originalLogger
})

describe('parser', () => {
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

  it('将裸 return 归一化为 return 命令', () => {
    const sentence = parseSentence('return;')

    expect(sentence).toMatchObject({
      command: commandType.return,
      commandRaw: 'return',
      content: '',
      args: [],
    })
  })

  it('旧运行时将 return 按未识别命令回退为对话', () => {
    expect(parseSentence('return;', LEGACY_ENGINE_RUNTIME_CAPABILITIES)).toMatchObject({
      command: commandType.say,
      commandRaw: 'return',
      content: 'return',
    })
    expect(parseSentence('return:success;', LEGACY_ENGINE_RUNTIME_CAPABILITIES)).toMatchObject({
      command: commandType.say,
      commandRaw: 'return',
      content: 'success',
      args: [{ key: 'speaker', value: 'return' }],
    })
  })

  it('parseSceneOrEmpty 在空文本下会返回空场景对象', () => {
    const scene = parseSceneOrEmpty('')

    expect(scene.sentenceList).toHaveLength(1)
    expect(scene.sentenceList[0]?.content).toBe('')
  })
})
