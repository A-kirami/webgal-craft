import '~/__tests__/mocks/modal-store'

import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { createSentence } from '~/features/editor/__tests__/statement-editor-test-utils'
import { serializeTransform } from '~/features/editor/effect-editor/effect-editor-config'
import { applyEffectEditorResultToSentence } from '~/features/editor/effect-editor/useStatementEffectEditorBridge'

describe('applyEffectEditorResultToSentence 行为', () => {
  it('setTransform 命令写入 content 并同步 duration/ease', () => {
    const sentence = createSentence({
      command: commandType.setTransform,
      content: '{"alpha":0.2}',
      args: [{ key: 'duration', value: '120' }],
    })
    const result = applyEffectEditorResultToSentence(sentence, {
      transform: { alpha: 0.8 },
      duration: '500',
      ease: 'easeInOut',
    })

    expect(result.content).toBe(serializeTransform({ alpha: 0.8 }))
    expect(result.args).toEqual([
      { key: 'duration', value: '500' },
      { key: 'ease', value: 'easeInOut' },
    ])
  })

  it('非 setTransform 命令更新 transform 参数并清理空 duration/ease', () => {
    const sentence = createSentence({
      command: commandType.changeFigure,
      content: 'hero.png',
      args: [
        { key: 'target', value: 'fig-left' },
        { key: 'transform', value: '{"alpha":0.3}' },
        { key: 'duration', value: '300' },
        { key: 'ease', value: 'linear' },
      ],
    })
    const result = applyEffectEditorResultToSentence(sentence, {
      transform: { alpha: 0.6, blur: 4 },
      duration: '',
      ease: '',
    })

    expect(result.content).toBe('hero.png')
    expect(result.args).toEqual([
      { key: 'target', value: 'fig-left' },
      { key: 'transform', value: serializeTransform({ alpha: 0.6, blur: 4 }) },
    ])
  })

  it('非 setTransform 命令可写入默认值用于重置继承效果', () => {
    const sentence = createSentence({
      command: commandType.changeFigure,
      content: 'hero.png',
      args: [
        { key: 'target', value: 'fig-left' },
        { key: 'transform', value: '{"blur":8}' },
      ],
    })
    const result = applyEffectEditorResultToSentence(sentence, {
      transform: { blur: 0 },
      duration: '',
      ease: '',
    })

    expect(result.args).toEqual([
      { key: 'target', value: 'fig-left' },
      { key: 'transform', value: serializeTransform({ blur: 0 }, { preserveDefaults: true }) },
    ])
  })
})
