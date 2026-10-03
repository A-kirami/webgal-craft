import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseCommandNode, serializeCommandNode } from '~/domain/script/codec'
import { serializeSentence } from '~/domain/script/serialize'
import { updateCommandNodeParam } from '~/domain/script/update'
import { UNSPECIFIED } from '~/features/editor/command-registry/schema'

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

  it('可将 changeFigure position 更新为扩展位置并移除旧位置 flag', () => {
    const sentence = mustParse('changeFigure: figure.png -id=fig-main -left -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('position', 'select'), 'right14')

    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'id', value: 'fig-main' },
      { key: 'right14', value: true },
      { key: 'x', value: 1 },
    ])
  })

  it('可将 changeFigureDiff position 互斥切换并保留未知参数', () => {
    const node = parseCommandNode(mustParse('changeFigureDiff: smile.png -id=hero -left -x=1;'))
    const updated = updateCommandNodeParam(node, makeParamDef('position', 'select'), 'right13')

    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'id', value: 'hero' },
      { key: 'right13', value: true },
      { key: 'x', value: 1 },
    ])
  })

  it('关闭 changeFigureDiff 的 animationFlag 会清除五个口型眨眼图参数', () => {
    const node = parseCommandNode(mustParse('changeFigureDiff: smile.png -id=hero -animationFlag -mouthOpen=open.png -mouthHalfOpen=half.png -mouthClose=close.png -eyesOpen=eyes_open.png -eyesClose=eyes_close.png -x=1;'))
    const updated = updateCommandNodeParam(node, makeParamDef('animationFlag', 'switch'), false)

    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'id', value: 'hero' },
      { key: 'x', value: 1 },
    ])
  })

  it('关闭 changeFigure 的 animationFlag 会清除五个口型眨眼图参数', () => {
    const sentence = mustParse('changeFigure: figure.png -id=fig-main -animationFlag -mouthOpen=open.png -mouthHalfOpen=half.png -mouthClose=close.png -eyesOpen=eyes_open.png -eyesClose=eyes_close.png -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('animationFlag', 'switch'), false)

    expect(updated).toBeDefined()
    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'id', value: 'fig-main' },
      { key: 'x', value: 1 },
    ])
    expect(serializeSentence(serializeCommandNode(updated!)))
      .toBe('changeFigure:figure.png -id=fig-main -x=1;')
  })

  it('关闭 animationFlag 后再编辑其他参数不会重新引入口型眨眼图', () => {
    const node = parseCommandNode(mustParse('changeFigure: figure.png -animationFlag -mouthOpen=open.png;'))
    const closed = updateCommandNodeParam(node, makeParamDef('animationFlag', 'switch'), false)
    const updated = updateCommandNodeParam(closed!, makeParamDef('id', 'text'), 'hero')

    expect(serializeCommandNode(updated!).args).toEqual([{ key: 'id', value: 'hero' }])
  })

  it('关闭 animationFlag 不影响未知参数与其他标准参数', () => {
    const node = parseCommandNode(mustParse('changeFigure: figure.png -left -animationFlag -mouthOpen=open.png -custom=keep -next -x=1;'))
    const updated = updateCommandNodeParam(node, makeParamDef('animationFlag', 'switch'), false)

    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'left', value: true },
      { key: 'custom', value: 'keep' },
      { key: 'next', value: true },
      { key: 'x', value: 1 },
    ])
  })

  it('开启 animationFlag 只为已填写的图片参数写入', () => {
    const node = parseCommandNode(mustParse('changeFigure: figure.png -id=fig-main;'))
    const enabled = updateCommandNodeParam(node, makeParamDef('animationFlag', 'switch'), true)
    expect(serializeCommandNode(enabled!).args).toEqual([
      { key: 'id', value: 'fig-main' },
      { key: 'animationFlag', value: true },
    ])

    const updated = updateCommandNodeParam(enabled!, makeParamDef('mouthOpen', 'text'), 'open.png')
    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'id', value: 'fig-main' },
      { key: 'animationFlag', value: true },
      { key: 'mouthOpen', value: 'open.png' },
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

  it('可更新 getUserInput defaultValue 值', () => {
    const sentence = mustParse('getUserInput: playerName -title=YourName -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('defaultValue', 'text'), 'Guest')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.getUserInput)
    expect(serialized.content).toBe('playerName')
    expect(serialized.args).toEqual([
      { key: 'title', value: 'YourName' },
      { key: 'defaultValue', value: 'Guest' },
      { key: 'x', value: 1 },
    ])
  })

  it('可更新 choose defaultChoose 并保留额外参数', () => {
    const sentence = mustParse('choose:a:a.txt|b:b.txt -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('defaultChoose', 'number'), 2)
    expect(updated).toBeDefined()

    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'defaultChoose', value: 2 },
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

  it('开启 next 时会关闭 generic 命令的 continue', () => {
    const node = parseCommandNode(mustParse('changeBg: bg.jpg -continue -x=1;'))
    const updated = updateCommandNodeParam(node, makeParamDef('next', 'switch'), true)

    expect(updated).toBeDefined()
    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'next', value: true },
      { key: 'x', value: 1 },
    ])
  })

  it('开启 continue 时会关闭 generic 命令的 next', () => {
    const node = parseCommandNode(mustParse('changeBg: bg.jpg -next -x=1;'))
    const updated = updateCommandNodeParam(node, makeParamDef('continue', 'switch'), true)

    expect(updated).toBeDefined()
    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'continue', value: true },
      { key: 'x', value: 1 },
    ])
  })

  it('开启 keep 时会关闭 generic 命令的 continue', () => {
    const node = parseCommandNode(mustParse('setTransform: {"alpha":1} -continue -x=1;'))
    const updated = updateCommandNodeParam(node, makeParamDef('keep', 'switch'), true)

    expect(updated).toBeDefined()
    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'keep', value: true },
      { key: 'x', value: 1 },
    ])
  })

  it('开启 continue 时会关闭 generic 命令的 next 和 keep', () => {
    const node = parseCommandNode(mustParse('setTransform: {"alpha":1} -next -keep -x=1;'))
    const updated = updateCommandNodeParam(node, makeParamDef('continue', 'switch'), true)

    expect(updated).toBeDefined()
    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'continue', value: true },
      { key: 'x', value: 1 },
    ])
  })

  it('开启 continue 时保留命令未注册的 keep 额外参数', () => {
    const node = parseCommandNode(mustParse('changeBg: bg.jpg -next -keep -x=1;'))
    const updated = updateCommandNodeParam(node, makeParamDef('continue', 'switch'), true)

    expect(updated).toBeDefined()
    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'continue', value: true },
      { key: 'keep', value: true },
      { key: 'x', value: 1 },
    ])
  })

  it('可关闭 say concat 标志', () => {
    const sentence = mustParse('Alice: hello -concat -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('concat', 'switch'), false)
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.command).toBe(commandType.say)
    expect(serialized.args).toEqual([
      { key: 'speaker', value: 'Alice' },
      { key: 'x', value: 1 },
    ])
  })

  it('更新 say 关联立绘时切换为显式 figureId 语法', () => {
    const node = parseCommandNode(mustParse('Alice: hello -left -x=1;'))
    const updated = updateCommandNodeParam(node, makeParamDef('figureId', 'text'), 'hero')
    expect(updated).toBeDefined()

    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'speaker', value: 'Alice' },
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

  it('setVar global 与 local 互斥', () => {
    const node = parseCommandNode(mustParse('setVar: score=10 -global;'))
    const updated = updateCommandNodeParam(node, makeParamDef('local', 'switch'), true)

    expect(updated).toBeDefined()
    expect(serializeCommandNode(updated!).args).toEqual([{ key: 'local', value: true }])
  })

  it('setVar 作用域选择器映射为兼容的 global/local flags', () => {
    const saveNode = parseCommandNode(mustParse('setVar: score=10 -global;'))
    const save = updateCommandNodeParam(saveNode, makeParamDef('scope', 'select'), UNSPECIFIED)
    expect(serializeCommandNode(save!).args).toEqual([])

    const globalNode = parseCommandNode(mustParse('setVar: score=10;'))
    const global = updateCommandNodeParam(globalNode, makeParamDef('scope', 'select'), 'global')
    expect(serializeCommandNode(global!).args).toEqual([{ key: 'global', value: true }])

    const local = updateCommandNodeParam(global!, makeParamDef('scope', 'select'), 'local')
    expect(serializeCommandNode(local!).args).toEqual([{ key: 'local', value: true }])
  })

  it('可更新 callScene 的 writeReturnTo 参数', () => {
    const node = parseCommandNode(mustParse('callScene:battle.txt -enemy=slime;'))
    const withReturnTarget = updateCommandNodeParam(node, makeParamDef('writeReturnTo', 'text'), 'result')
    expect(withReturnTarget).toBeDefined()
    expect(serializeCommandNode(withReturnTarget!).args).toEqual([
      { key: 'writeReturnTo', value: 'result' },
      { key: 'enemy', value: 'slime' },
    ])
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

  it('空内容的 say 更新参数后回退到显式 say 头', () => {
    const node = parseCommandNode(mustParse('say:;'))
    const updated = updateCommandNodeParam(node, makeParamDef('fontSize', 'select'), 'small')
    expect(updated).toBeDefined()

    const serialized = serializeCommandNode(updated!)
    expect(serialized.commandRaw).toBe('say')
    expect(serialized.args).toEqual([{ key: 'fontSize', value: 'small' }])
    // 无命令头的 ' -fontSize=small;' 会被多行语句引擎当成上一条语句的续行
    expect(serializeSentence(serialized)).toBe('say: -fontSize=small;')
  })

  it('类型化命令的不支持参数返回 undefined', () => {
    const sentence = mustParse('setVar: score=10;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeParam(node, makeParamDef('unknown', 'text'), 'abc')
    expect(updated).toBeUndefined()
  })

  it('编辑旧写入参数时保留语句里已有的 transformFrom', () => {
    const node = parseCommandNode(mustParse('setTransform: {"alpha":1} -transformFrom=default -writeDefault -x=1;'))
    const updated = updateCommandNodeParam(node, makeParamDef('writeDefault', 'switch'), false)

    expect(updated).toBeDefined()
    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'transformFrom', value: 'default' },
      { key: 'x', value: 1 },
    ])
    expect(serializeSentence(serializeCommandNode(updated!)))
      .toBe('setTransform:{"alpha":1} -transformFrom=default -x=1;')
  })

  it('选择默认的 transformFrom=current 只移除该参数', () => {
    const node = parseCommandNode(mustParse('setTransform: {"alpha":1} -transformFrom=default -ignoreDefault -x=1;'))
    const updated = updateCommandNodeParam(node, makeParamDef('transformFrom', 'select', 'current'), 'current')

    expect(updated).toBeDefined()
    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'ignoreDefault', value: true },
      { key: 'x', value: 1 },
    ])
  })

  it('写入 transformFrom=default 时只新增该显式参数', () => {
    const node = parseCommandNode(mustParse('setTransform: {"alpha":1} -target=fig-left -x=1;'))
    const updated = updateCommandNodeParam(node, makeParamDef('transformFrom', 'select', 'current'), 'default')

    expect(updated).toBeDefined()
    expect(serializeCommandNode(updated!).args).toEqual([
      { key: 'target', value: 'fig-left' },
      { key: 'transformFrom', value: 'default' },
      { key: 'x', value: 1 },
    ])
  })
})
