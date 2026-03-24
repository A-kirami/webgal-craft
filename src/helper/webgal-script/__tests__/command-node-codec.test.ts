import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseCommandNode, SAY_CONTINUATION_RAW, serializeCommandNode } from '~/helper/webgal-script/codec'

import { mustParse } from './utils'

import type { CommandNode } from '~/helper/webgal-script/types'

function roundtripToNode(raw: string): { first: CommandNode, second: CommandNode } {
  const sentence = mustParse(raw)
  const first = parseCommandNode(sentence)
  const serialized = serializeCommandNode(first)
  const second = parseCommandNode(serialized)
  return { first, second }
}

describe('命令节点编解码', () => {
  it('解析类型化 say 节点并将未知参数保留在 extraArgs 中', () => {
    const sentence = mustParse('Alice: hello -fontSize=medium -vocal=voice.ogg -volume=80 -left -figureId=hero -next -continue -concat -notend -x=1;')
    const node = parseCommandNode(sentence)
    expect(node.type).toBe(commandType.say)
    if (node.type !== commandType.say) {
      return
    }

    expect(node.text).toBe('hello')
    expect(node.speaker).toBe('Alice')
    expect(node.fontSize).toBe('medium')
    expect(node.vocal).toBe('voice.ogg')
    expect(node.volume).toBe(80)
    expect(node.figurePosition).toBe('left')
    expect(node.figureId).toBe('hero')
    expect(node.next).toBe(true)
    expect(node.continue).toBe(true)
    expect(node.concat).toBe(true)
    expect(node.notend).toBe(true)
    expect(node.extraArgs).toEqual([{ key: 'x', value: 1 }])
  })

  it('显式 say 命令从 -speaker 参数读取角色名', () => {
    const sentence = mustParse('say:你好，世界！ -speaker=角色A;')
    const node = parseCommandNode(sentence)
    expect(node.type).toBe(commandType.say)
    if (node.type !== commandType.say) {
      return
    }

    expect(node.text).toBe('你好，世界！')
    expect(node.speaker).toBe('角色A')
    // speaker 不应残留在 extraArgs 中
    expect(node.extraArgs.find(a => a.key === 'speaker')).toBeUndefined()
  })

  it('显式 say 命令无 -speaker 参数时 speaker 为空', () => {
    const sentence = mustParse('say:世界，你好！;')
    const node = parseCommandNode(sentence)
    expect(node.type).toBe(commandType.say)
    if (node.type !== commandType.say) {
      return
    }

    expect(node.text).toBe('世界，你好！')
    expect(node.speaker).toBe('')
  })

  it('显式 say 命令序列化后转为简写形式', () => {
    const sentence = mustParse('say:你好 -speaker=角色A;')
    const node = parseCommandNode(sentence)
    expect(node.type).toBe(commandType.say)
    const serialized = serializeCommandNode(node)
    // 有说话人时强制简写：commandRaw 为说话人，speaker 不在 args 中
    expect(serialized.commandRaw).toBe('角色A')
    expect(serialized.args.find(a => a.key === 'speaker')).toBeUndefined()
  })

  it('无说话人无 clear 的标准形式序列化为续写简写', () => {
    const sentence = mustParse('say:世界，你好！;')
    const node = parseCommandNode(sentence)
    expect(node.type).toBe(commandType.say)
    const serialized = serializeCommandNode(node)
    // 续写形式：commandRaw 为 SAY_CONTINUATION_RAW 哨兵值
    expect(serialized.commandRaw).toBe(SAY_CONTINUATION_RAW)
  })

  it('say -clear 序列化为旁白简写（移除 -clear）', () => {
    const sentence = mustParse('say:你好世界 -clear;')
    const node = parseCommandNode(sentence)
    expect(node.type).toBe(commandType.say)
    if (node.type !== commandType.say) {
      return
    }
    expect(node.clear).toBe(true)
    const serialized = serializeCommandNode(node)
    // 旁白简写：commandRaw 为空字符串，-clear 不在 args 中
    expect(serialized.commandRaw).toBe('')
    expect(serialized.args.find(a => a.key === 'clear')).toBeUndefined()
  })

  it('说话人与命令头冲突时回退标准形式', () => {
    const sentence = mustParse('Alice: hello;')
    const node = parseCommandNode(sentence)
    expect(node.type).toBe(commandType.say)
    if (node.type !== commandType.say) {
      return
    }
    // 模拟用户将说话人改为与命令头冲突的名称
    const updated = { ...node, speaker: 'bgm' }
    const serialized = serializeCommandNode(updated)
    expect(serialized.commandRaw).toBe('say')
    expect(serialized.args.find(a => a.key === 'speaker')?.value).toBe('bgm')
  })

  it('解析类型化 comment 节点', () => {
    const sentence = mustParse('; this is comment')
    const node = parseCommandNode(sentence)
    expect(node.type).toBe(commandType.comment)
    if (node.type !== commandType.comment) {
      return
    }
    expect(node.text).toBe('this is comment')
    expect(node.extraArgs).toEqual([{ key: 'next', value: true }])
  })

  it('解析类型化 setVar 节点', () => {
    const sentence = mustParse('setVar: score=10 -global -custom=foo;')
    const node = parseCommandNode(sentence)
    expect(node.type).toBe(commandType.setVar)
    if (node.type !== commandType.setVar) {
      return
    }

    expect(node.name).toBe('score')
    expect(node.value).toBe('10')
    expect(node.global).toBe(true)
    expect(node.extraArgs).toEqual([{ key: 'custom', value: 'foo' }])
  })

  it('解析类型化 choose/applyStyle 节点', () => {
    const chooseSentence = mustParse('choose: A:scene1.txt|B:scene2.txt -next;')
    const chooseNode = parseCommandNode(chooseSentence)
    expect(chooseNode.type).toBe(commandType.choose)
    if (chooseNode.type === commandType.choose) {
      expect(chooseNode.choices).toEqual([
        { name: 'A', file: 'scene1.txt' },
        { name: 'B', file: 'scene2.txt' },
      ])
      expect(chooseNode.extraArgs).toEqual([{ key: 'next', value: true }])
    }

    const styleSentence = mustParse('applyStyle: old->new,foo->bar;')
    const styleNode = parseCommandNode(styleSentence)
    expect(styleNode.type).toBe(commandType.applyStyle)
    if (styleNode.type === commandType.applyStyle) {
      expect(styleNode.rules).toEqual([
        { oldName: 'old', newName: 'new' },
        { oldName: 'foo', newName: 'bar' },
      ])
    }
  })

  it('非类型化命令解析为通用节点', () => {
    const sentence = mustParse('changeBg: bg.jpg -unlockname=bg1 -duration=300 -next -custom=abc;')
    const node = parseCommandNode(sentence)
    expect(node.type).toBe(commandType.changeBg)
    expect('args' in node).toBe(true)
    if (!('args' in node)) {
      return
    }
    expect(node.content).toBe('bg.jpg')
    expect(node.args).toEqual([
      { key: 'unlockname', value: 'bg1' },
      { key: 'duration', value: 300 },
      { key: 'next', value: true },
      { key: 'custom', value: 'abc' },
    ])
  })

  it('未注册命令回退为通用节点', () => {
    const sentence = mustParse('setFilter: blur -x=1;')
    const node = parseCommandNode(sentence)
    expect(node.type).toBe(commandType.setFilter)
    expect('args' in node).toBe(true)
    if (!('args' in node)) {
      return
    }
    expect(node.content).toBe('blur')
    expect(node.args).toEqual([{ key: 'x', value: 1 }])
  })

  it('类型化节点经 parse/serialize/parse 后保持稳定', () => {
    const fixtures = [
      'Alice: hello -fontSize=medium -vocal=voice.ogg -volume=80 -id -figureId=hero -next -continue -concat -notend -x=1;',
      '; this is comment',
      'setVar: score=10 -global -custom=foo;',
      'choose: A:scene1.txt|B:scene2.txt -next;',
      'applyStyle: old->new,foo->bar;',
    ] as const

    for (const raw of fixtures) {
      const { first, second } = roundtripToNode(raw)
      expect(second).toEqual(first)
    }
  })

  it('通用节点经 parse/serialize/parse 后保持稳定', () => {
    const fixtures = [
      'changeBg: bg.jpg -unlockname=bg1 -series=s1 -transform={"x":1} -duration=300 -ease=easeOut -enter=fadeIn -exit=fadeOut -enterDuration=200 -exitDuration=220 -next -custom=abc;',
      'changeFigure: figure.png -id=fig-main -right -zIndex=3 -motion=idle -expression=smile -blendMode=add -transform={"x":1} -duration=300 -ease=easeOut -enter=fadeIn -exit=fadeOut -enterDuration=200 -exitDuration=220 -animationFlag -mouthOpen=open.png -eyesClose=close.png -bounds=0,0,1,1 -blink={"blinkInterval":3000} -focus={"x":0} -next -custom=abc;',
      'setTransform: {"alpha":0.7} -target=fig-left -duration=500 -ease=easeInOut -writeDefault -keep -next -custom=abc;',
    ] as const

    for (const raw of fixtures) {
      const { first, second } = roundtripToNode(raw)
      expect(second).toEqual(first)
    }
  })
})
