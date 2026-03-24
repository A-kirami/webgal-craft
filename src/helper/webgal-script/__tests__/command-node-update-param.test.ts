import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseCommandNode, serializeCommandNode } from '~/helper/webgal-script/codec'
import { updateCommandNodeParam } from '~/helper/webgal-script/update'

import { makeParamDef, mustParse } from './utils'

describe('命令节点参数更新器', () => {
  it('输入为空时可清除 setTransform duration', () => {
    const sentence = mustParse('setTransform: {"alpha":1} -duration=500 -next -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('duration', 'number'), '')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.setTransform)
    expect(serialized.args).toEqual([
      { key: 'next', value: true },
      { key: 'x', value: 1 },
    ])
  })

  it('可更新 changeBg unlockname 并保留额外参数', () => {
    const sentence = mustParse('changeBg: bg.jpg -unlockname=bg1 -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('unlockname', 'text'), 'bg2')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.changeBg)
    expect(serialized.args).toEqual([
      { key: 'unlockname', value: 'bg2' },
      { key: 'x', value: 1 },
    ])
  })

  it('可更新 setTransform target', () => {
    const sentence = mustParse('setTransform: {"alpha":1} -target=fig-left -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('target', 'select'), 'fig-right')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.args).toEqual([
      { key: 'target', value: 'fig-right' },
      { key: 'x', value: 1 },
    ])
  })

  it('可更新 setAnimation target 并保留额外参数', () => {
    const sentence = mustParse('setAnimation: bounce -target=fig-left -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('target', 'select'), 'fig-right')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.setAnimation)
    expect(serialized.args).toEqual([
      { key: 'target', value: 'fig-right' },
      { key: 'x', value: 1 },
    ])
  })

  it('可更新 changeFigure motion 并保留额外参数', () => {
    const sentence = mustParse('changeFigure: figure.png -id=fig-main -left -motion=idle -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('motion', 'text'), 'wave')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.changeFigure)
    expect(serialized.args).toEqual([
      { key: 'id', value: 'fig-main' },
      { key: 'left', value: true },
      { key: 'motion', value: 'wave' },
      { key: 'x', value: 1 },
    ])
  })

  it('可将 changeFigure position 从 left 更新为 right', () => {
    const sentence = mustParse('changeFigure: figure.png -id=fig-main -left -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('position', 'select'), 'right')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.changeFigure)
    expect(serialized.args).toEqual([
      { key: 'id', value: 'fig-main' },
      { key: 'right', value: true },
      { key: 'x', value: 1 },
    ])
  })

  it('可更新 setTempAnimation target 并保留额外参数', () => {
    const sentence = mustParse('setTempAnimation: bounce -target=fig-left -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('target', 'select'), 'fig-right')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.setTempAnimation)
    expect(serialized.args).toEqual([
      { key: 'target', value: 'fig-right' },
      { key: 'x', value: 1 },
    ])
  })

  it('可更新 setComplexAnimation duration', () => {
    const sentence = mustParse('setComplexAnimation: universalSoftIn -target=fig-left -duration=500 -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('duration', 'number'), 800)
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.setComplexAnimation)
    expect(serialized.args).toEqual([
      { key: 'target', value: 'fig-left' },
      { key: 'duration', value: 800 },
      { key: 'x', value: 1 },
    ])
  })

  it('可更新 setTransition enter 动画', () => {
    const sentence = mustParse('setTransition:  -target=fig-left -enter=fadeIn -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('enter', 'text'), 'zoomIn')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.setTransition)
    expect(serialized.args).toEqual([
      { key: 'target', value: 'fig-left' },
      { key: 'enter', value: 'zoomIn' },
      { key: 'x', value: 1 },
    ])
  })

  it('可更新 getUserInput default 值', () => {
    const sentence = mustParse('getUserInput: playerName -title=YourName -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('default', 'text'), 'Guest')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.getUserInput)
    expect(serialized.content).toBe('playerName')
    expect(serialized.args).toEqual([
      { key: 'title', value: 'YourName' },
      { key: 'default', value: 'Guest' },
      { key: 'x', value: 1 },
    ])
  })

  it('可更新 bgm volume 并保留额外参数', () => {
    const sentence = mustParse('bgm: bgm.ogg -volume=80 -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('volume', 'number', 100), 60)
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.bgm)
    expect(serialized.args).toEqual([
      { key: 'volume', value: 60 },
      { key: 'x', value: 1 },
    ])
  })

  it('可更新 playEffect id 并保留额外参数', () => {
    const sentence = mustParse('playEffect: click.ogg -id=sfx1 -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('id', 'text'), 'sfx2')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.playEffect)
    expect(serialized.args).toEqual([
      { key: 'id', value: 'sfx2' },
      { key: 'x', value: 1 },
    ])
  })

  it('可开启 video skipOff', () => {
    const sentence = mustParse('playVideo: intro.mp4;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('skipOff', 'switch'), true)
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.video)
    expect(serialized.args).toEqual([{ key: 'skipOff', value: true }])
  })

  it('可关闭 say concat 标志', () => {
    const sentence = mustParse('Alice: hello -concat -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('concat', 'switch'), false)
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.say)
    expect(serialized.args).toEqual([{ key: 'x', value: 1 }])
  })

  it('可更新 say figurePosition 为 id', () => {
    const sentence = mustParse('Alice: hello -left -figureId=hero -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('figurePosition', 'select'), 'id')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.say)
    expect(serialized.args).toEqual([
      { key: 'id', value: true },
      { key: 'figureId', value: 'hero' },
      { key: 'x', value: 1 },
    ])
  })

  it('可开启 setVar global 标志', () => {
    const sentence = mustParse('setVar: score=10;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('global', 'switch'), true)
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.setVar)
    expect(serialized.args).toEqual([{ key: 'global', value: true }])
  })

  it('可更新 callSteam achievementId 并保留额外参数', () => {
    const sentence = mustParse('callSteam:  -achievementId=achv-1 -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('achievementId', 'text'), 'achv-2')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.callSteam)
    expect(serialized.args).toEqual([
      { key: 'achievementId', value: 'achv-2' },
      { key: 'x', value: 1 },
    ])
  })

  it('可更新 intro delayTime 并保留额外参数', () => {
    const sentence = mustParse('intro: hello -fontSize=small -delayTime=2000 -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('delayTime', 'number'), 3000)
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.intro)
    expect(serialized.content).toBe('hello')
    expect(serialized.args).toEqual([
      { key: 'fontSize', value: 'small' },
      { key: 'delayTime', value: 3000 },
      { key: 'x', value: 1 },
    ])
  })

  it('可更新 unlockCg name 并保留额外参数', () => {
    const sentence = mustParse('unlockCg: cg1.jpg -name=CG1 -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('name', 'text'), 'CG2')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.unlockCg)
    expect(serialized.content).toBe('cg1.jpg')
    expect(serialized.args).toEqual([
      { key: 'name', value: 'CG2' },
      { key: 'x', value: 1 },
    ])
  })

  it('可更新 unlockBgm series 并保留额外参数', () => {
    const sentence = mustParse('unlockBgm: bgm1.ogg -name=BGM1 -series=s1 -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('series', 'text'), 's2')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.unlockBgm)
    expect(serialized.content).toBe('bgm1.ogg')
    expect(serialized.args).toEqual([
      { key: 'name', value: 'BGM1' },
      { key: 'series', value: 's2' },
      { key: 'x', value: 1 },
    ])
  })

  it('类型化命令的不支持参数返回 undefined', () => {
    const sentence = mustParse('setVar: score=10;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('unknown', 'text'), 'abc')
    expect(updated).toBeUndefined()
  })
})
