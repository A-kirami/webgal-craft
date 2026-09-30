import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { LEGACY_ENGINE_RUNTIME_CAPABILITIES, resolveEngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'
import { GATED_COMMANDS, parseScene, parseSceneOrEmpty, parseSentence, resolveWebgalScriptConfigKey, WEBGAL_SCRIPT_LANGUAGES } from '~/domain/script/parser'
import { getCommandScriptString } from '~/features/editor/command-registry'

/** 4.6.3 / 4.6.4：有场景语义，但没有 changeFigureDiff */
const WITHOUT_CHANGE_FIGURE_DIFF = { changeFigureDiff: false, sceneSemantics: true }
const WITHOUT_SCENE_SEMANTICS = LEGACY_ENGINE_RUNTIME_CAPABILITIES

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

  it('缺少场景语义的运行时将 return 按未识别命令回退为对话', () => {
    expect(parseSentence('return;', WITHOUT_SCENE_SEMANTICS)).toMatchObject({
      command: commandType.say,
      commandRaw: 'return',
      content: 'return',
    })
    expect(parseSentence('return:success;', WITHOUT_SCENE_SEMANTICS)).toMatchObject({
      command: commandType.say,
      commandRaw: 'return',
      content: 'success',
      args: [{ key: 'speaker', value: 'return' }],
    })
  })

  it('只缺立绘差分的运行时仍认识 return', () => {
    // 4.6.3 / 4.6.4：有场景语义但没有 changeFigureDiff，不能因此丢掉 return
    expect(parseSentence('return;', WITHOUT_CHANGE_FIGURE_DIFF)).toMatchObject({
      command: commandType.return,
      content: '',
    })
    expect(parseSentence('changeFigureDiff:stand.webp -left;', WITHOUT_CHANGE_FIGURE_DIFF)).toMatchObject({
      command: commandType.say,
      commandRaw: 'changeFigureDiff',
      content: 'stand.webp',
    })
  })

  it('parseSceneOrEmpty 在空文本下会返回空场景对象', () => {
    const scene = parseSceneOrEmpty('')

    expect(scene.sentenceList).toHaveLength(1)
    expect(scene.sentenceList[0]?.content).toBe('')
  })

  it.each([
    ['4.6.5', 'full'],
    ['4.6.4', 'missing:changeFigureDiff'],
    ['4.6.2', 'missing:sceneSemantics,changeFigureDiff'],
  ] as const)('%s 的能力选中的档位与该版本的受门控命令一致', (version, expectedKey) => {
    const capabilities = resolveEngineRuntimeCapabilities(version)

    expect(resolveWebgalScriptConfigKey(capabilities)).toBe(expectedKey)

    // 期望取自能力本身，不抄一份命令清单：受门控命令能解析成命令 ⇔ 该能力为真
    for (const { command, capability } of GATED_COMMANDS) {
      const script = `${getCommandScriptString(command)}:;`

      expect(parseSentence(script, capabilities)?.command)
        .toBe(capabilities[capability] ? command : commandType.say)
    }
  })

  it('档位标识由缺失的能力推导，不手写档位清单', () => {
    const languageIds = WEBGAL_SCRIPT_LANGUAGES.map(language => language.id)

    // 档位数 = 可达的能力剖面数；新增受门控命令时这里与语言注册都会自动跟上
    expect(languageIds).toEqual([
      'full',
      'missing:changeFigureDiff',
      'missing:sceneSemantics,changeFigureDiff',
    ])
  })
})
