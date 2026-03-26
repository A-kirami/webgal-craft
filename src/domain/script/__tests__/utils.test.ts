import { describe, expect, it } from 'vitest'

import { makeParamDef, mustParse } from './utils'

describe('webgal-script 测试工具', () => {
  it('mustParse 返回可用的句子对象', () => {
    const sentence = mustParse('bgm: bgm.ogg;')

    expect(sentence.commandRaw).toBe('bgm')
    expect(sentence.content).toBe('bgm.ogg')
  })

  it('makeParamDef 保持 CommandParamDescriptor 形状', () => {
    expect(makeParamDef('duration', 'number', 500)).toEqual({
      key: 'duration',
      type: 'number',
      defaultValue: 500,
    })
  })
})
