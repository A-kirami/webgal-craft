import { describe, expect, it } from 'vitest'

import { parseCommandNode } from '~/domain/script/codec'
import { hasCommandNodeParam, readCommandNodeParamValue } from '~/domain/script/params'

import { makeParamDef, mustParse } from './utils'

describe('命令节点参数访问', () => {
  it('读取类型化 setTransform 参数', () => {
    const sentence = mustParse('setTransform: {"alpha":1} -target=fig-left -duration=500 -ease=easeOut -writeDefault -keep -next;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('target', 'text'))).toBe('fig-left')
    expect(readCommandNodeParamValue(node, makeParamDef('duration', 'number'))).toBe(500)
    expect(readCommandNodeParamValue(node, makeParamDef('ease', 'text'))).toBe('easeOut')
    expect(readCommandNodeParamValue(node, makeParamDef('writeDefault', 'switch'))).toBe(true)
    expect(readCommandNodeParamValue(node, makeParamDef('keep', 'switch'))).toBe(true)
    expect(readCommandNodeParamValue(node, makeParamDef('next', 'switch'))).toBe(true)
  })

  it('读取类型化 changeBg 参数', () => {
    const sentence = mustParse('changeBg: bg.jpg -unlockname=bg1 -series=s1 -transform={"x":1} -duration=300 -ease=easeOut -enter=fadeIn -exit=fadeOut -enterDuration=200 -exitDuration=220 -next;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('unlockname', 'text'))).toBe('bg1')
    expect(readCommandNodeParamValue(node, makeParamDef('series', 'text'))).toBe('s1')
    expect(readCommandNodeParamValue(node, makeParamDef('transform', 'text'))).toBe('{"x":1}')
    expect(readCommandNodeParamValue(node, makeParamDef('duration', 'number'))).toBe(300)
    expect(readCommandNodeParamValue(node, makeParamDef('ease', 'text'))).toBe('easeOut')
    expect(readCommandNodeParamValue(node, makeParamDef('enter', 'text'))).toBe('fadeIn')
    expect(readCommandNodeParamValue(node, makeParamDef('exit', 'text'))).toBe('fadeOut')
    expect(readCommandNodeParamValue(node, makeParamDef('enterDuration', 'number'))).toBe(200)
    expect(readCommandNodeParamValue(node, makeParamDef('exitDuration', 'number'))).toBe(220)
    expect(readCommandNodeParamValue(node, makeParamDef('next', 'switch'))).toBe(true)
  })

  it('读取类型化 changeFigure 参数', () => {
    const sentence = mustParse('changeFigure: figure.png -id=fig-main -right -zIndex=2 -motion=idle -expression=smile -blendMode=add -transform={"x":1} -duration=300 -ease=easeOut -enter=fadeIn -exit=fadeOut -enterDuration=200 -exitDuration=220 -animationFlag -mouthOpen=open.png -blink={"blinkInterval":3000} -focus={"x":0} -next;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('id', 'text'))).toBe('fig-main')
    expect(readCommandNodeParamValue(node, makeParamDef('position', 'select'))).toBe('right')
    expect(readCommandNodeParamValue(node, makeParamDef('zIndex', 'number'))).toBe(2)
    expect(readCommandNodeParamValue(node, makeParamDef('motion', 'text'))).toBe('idle')
    expect(readCommandNodeParamValue(node, makeParamDef('expression', 'text'))).toBe('smile')
    expect(readCommandNodeParamValue(node, makeParamDef('blendMode', 'text'))).toBe('add')
    expect(readCommandNodeParamValue(node, makeParamDef('transform', 'text'))).toBe('{"x":1}')
    expect(readCommandNodeParamValue(node, makeParamDef('duration', 'number'))).toBe(300)
    expect(readCommandNodeParamValue(node, makeParamDef('ease', 'text'))).toBe('easeOut')
    expect(readCommandNodeParamValue(node, makeParamDef('enter', 'text'))).toBe('fadeIn')
    expect(readCommandNodeParamValue(node, makeParamDef('exit', 'text'))).toBe('fadeOut')
    expect(readCommandNodeParamValue(node, makeParamDef('enterDuration', 'number'))).toBe(200)
    expect(readCommandNodeParamValue(node, makeParamDef('exitDuration', 'number'))).toBe(220)
    expect(readCommandNodeParamValue(node, makeParamDef('animationFlag', 'switch'))).toBe(true)
    expect(readCommandNodeParamValue(node, makeParamDef('mouthOpen', 'text'))).toBe('open.png')
    expect(readCommandNodeParamValue(node, makeParamDef('blink', 'text'))).toBe('{"blinkInterval":3000}')
    expect(readCommandNodeParamValue(node, makeParamDef('focus', 'text'))).toBe('{"x":0}')
    expect(readCommandNodeParamValue(node, makeParamDef('next', 'switch'))).toBe(true)
  })

  it('读取类型化 setAnimation 参数', () => {
    const sentence = mustParse('setAnimation: bounce -target=fig-left -writeDefault -keep -next;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('target', 'text'))).toBe('fig-left')
    expect(readCommandNodeParamValue(node, makeParamDef('writeDefault', 'switch'))).toBe(true)
    expect(readCommandNodeParamValue(node, makeParamDef('keep', 'switch'))).toBe(true)
    expect(readCommandNodeParamValue(node, makeParamDef('next', 'switch'))).toBe(true)
  })

  it('读取类型化 setTempAnimation 参数', () => {
    const sentence = mustParse('setTempAnimation: bounce -target=fig-left -writeDefault -keep -next;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('target', 'text'))).toBe('fig-left')
    expect(readCommandNodeParamValue(node, makeParamDef('writeDefault', 'switch'))).toBe(true)
    expect(readCommandNodeParamValue(node, makeParamDef('keep', 'switch'))).toBe(true)
    expect(readCommandNodeParamValue(node, makeParamDef('next', 'switch'))).toBe(true)
  })

  it('读取类型化 setComplexAnimation 参数', () => {
    const sentence = mustParse('setComplexAnimation: universalSoftIn -target=fig-left -duration=500 -next;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('target', 'text'))).toBe('fig-left')
    expect(readCommandNodeParamValue(node, makeParamDef('duration', 'number'))).toBe(500)
    expect(readCommandNodeParamValue(node, makeParamDef('next', 'switch'))).toBe(true)
  })

  it('读取类型化 setTransition 参数', () => {
    const sentence = mustParse('setTransition:  -target=fig-left -enter=fadeIn -exit=fadeOut;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('target', 'text'))).toBe('fig-left')
    expect(readCommandNodeParamValue(node, makeParamDef('enter', 'text'))).toBe('fadeIn')
    expect(readCommandNodeParamValue(node, makeParamDef('exit', 'text'))).toBe('fadeOut')
  })

  it('读取类型化 getUserInput 参数', () => {
    const sentence = mustParse('getUserInput: playerName -title=YourName -buttonText=Confirm -default=Guest;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('title', 'text'))).toBe('YourName')
    expect(readCommandNodeParamValue(node, makeParamDef('buttonText', 'text'))).toBe('Confirm')
    expect(readCommandNodeParamValue(node, makeParamDef('default', 'text'))).toBe('Guest')
  })

  it('读取类型化 bgm 参数', () => {
    const sentence = mustParse('bgm: bgm.ogg -volume=80 -enter=500 -unlockname=bgm1 -series=s1;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('volume', 'number'))).toBe(80)
    expect(readCommandNodeParamValue(node, makeParamDef('enter', 'number'))).toBe(500)
    expect(readCommandNodeParamValue(node, makeParamDef('unlockname', 'text'))).toBe('bgm1')
    expect(readCommandNodeParamValue(node, makeParamDef('series', 'text'))).toBe('s1')
  })

  it('读取类型化 playEffect 参数', () => {
    const sentence = mustParse('playEffect: click.ogg -volume=70 -id=sfx1;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('volume', 'number'))).toBe(70)
    expect(readCommandNodeParamValue(node, makeParamDef('id', 'text'))).toBe('sfx1')
  })

  it('读取类型化 video 参数', () => {
    const sentence = mustParse('playVideo: intro.mp4 -skipOff;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('skipOff', 'switch'))).toBe(true)
  })

  it('读取类型化 callSteam 参数', () => {
    const sentence = mustParse('callSteam:  -achievementId=achv-1 -x=1;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('achievementId', 'text'))).toBe('achv-1')
    // readCommandNodeParamValue 对未注册的额外参数返回原始存储值，故即使 makeParamDef 声明为 text，这里仍保留数字 1。
    expect(readCommandNodeParamValue(node, makeParamDef('x', 'text'))).toBe(1)
  })

  it('读取类型化 intro 参数', () => {
    const sentence = mustParse('intro: hello -fontSize=small -fontColor=#fff -backgroundColor=#000 -animation=fadeIn -delayTime=2000 -hold -userForward -x=1;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('fontSize', 'text'))).toBe('small')
    expect(readCommandNodeParamValue(node, makeParamDef('fontColor', 'text'))).toBe('#fff')
    expect(readCommandNodeParamValue(node, makeParamDef('backgroundColor', 'text'))).toBe('#000')
    expect(readCommandNodeParamValue(node, makeParamDef('animation', 'text'))).toBe('fadeIn')
    expect(readCommandNodeParamValue(node, makeParamDef('delayTime', 'number'))).toBe(2000)
    expect(readCommandNodeParamValue(node, makeParamDef('hold', 'switch'))).toBe(true)
    expect(readCommandNodeParamValue(node, makeParamDef('userForward', 'switch'))).toBe(true)
    // 这里验证的是回退到 extraArgs 时不做类型强制转换，而不是 makeParamDef 的 text 声明。
    expect(readCommandNodeParamValue(node, makeParamDef('x', 'text'))).toBe(1)
  })

  it('读取类型化 unlockCg/unlockBgm 参数', () => {
    const unlockCgSentence = mustParse('unlockCg: cg1.jpg -name=CG1 -series=s1 -x=1;')
    const unlockCgNode = parseCommandNode(unlockCgSentence)

    expect(readCommandNodeParamValue(unlockCgNode, makeParamDef('name', 'text'))).toBe('CG1')
    expect(readCommandNodeParamValue(unlockCgNode, makeParamDef('series', 'text'))).toBe('s1')
    expect(readCommandNodeParamValue(unlockCgNode, makeParamDef('x', 'text'))).toBe(1)

    const unlockBgmSentence = mustParse('unlockBgm: bgm1.ogg -name=BGM1 -series=s1 -x=1;')
    const unlockBgmNode = parseCommandNode(unlockBgmSentence)

    expect(readCommandNodeParamValue(unlockBgmNode, makeParamDef('name', 'text'))).toBe('BGM1')
    expect(readCommandNodeParamValue(unlockBgmNode, makeParamDef('series', 'text'))).toBe('s1')
    // 与上面的 x 一样，这里确认 readCommandNodeParamValue 会透传原始存储值，而不是按 makeParamDef 进行 coercion。
    expect(readCommandNodeParamValue(unlockBgmNode, makeParamDef('x', 'text'))).toBe(1)
  })

  it('读取类型化 say 标志参数', () => {
    const sentence = mustParse('Alice: hello -fontSize=medium -vocal=voice.ogg -volume=80 -id -figureId=hero -next -continue -concat -notend;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('fontSize', 'select'))).toBe('medium')
    expect(readCommandNodeParamValue(node, makeParamDef('vocal', 'text'))).toBe('voice.ogg')
    expect(readCommandNodeParamValue(node, makeParamDef('volume', 'number'))).toBe(80)
    expect(readCommandNodeParamValue(node, makeParamDef('figurePosition', 'select'))).toBe('id')
    expect(readCommandNodeParamValue(node, makeParamDef('figureId', 'text'))).toBe('hero')
    expect(readCommandNodeParamValue(node, makeParamDef('concat', 'switch'))).toBe(true)
    expect(readCommandNodeParamValue(node, makeParamDef('notend', 'switch'))).toBe(true)
  })

  it('未知 key 回退到 args/extraArgs', () => {
    const sentence = mustParse('changeBg: bg.jpg -next -custom=abc;')
    const node = parseCommandNode(sentence)

    expect(readCommandNodeParamValue(node, makeParamDef('custom', 'text'))).toBe('abc')
  })

  it('检测类型化已知参数是否存在', () => {
    const sentence = mustParse('Alice: hello -fontSize=medium -left -figureId=hero -next -concat;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'fontSize')).toBe(true)
    expect(hasCommandNodeParam(node, 'figurePosition')).toBe(true)
    expect(hasCommandNodeParam(node, 'left')).toBe(true)
    expect(hasCommandNodeParam(node, 'figureId')).toBe(true)
    expect(hasCommandNodeParam(node, 'next')).toBe(false)
    expect(hasCommandNodeParam(node, 'concat')).toBe(true)
    expect(hasCommandNodeParam(node, 'continue')).toBe(false)
  })

  it('检测类型化额外参数是否存在', () => {
    const sentence = mustParse('changeBg: bg.jpg -duration=500 -custom=abc;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'duration')).toBe(true)
    expect(hasCommandNodeParam(node, 'custom')).toBe(true)
    expect(hasCommandNodeParam(node, 'next')).toBe(false)
  })

  it('检测 changeBg 已知参数是否存在', () => {
    const sentence = mustParse('changeBg: bg.jpg -unlockname=bg1 -transform={"x":1} -duration=300 -next;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'unlockname')).toBe(true)
    expect(hasCommandNodeParam(node, 'transform')).toBe(true)
    expect(hasCommandNodeParam(node, 'duration')).toBe(true)
    expect(hasCommandNodeParam(node, 'next')).toBe(true)
    expect(hasCommandNodeParam(node, 'series')).toBe(false)
  })

  it('检测 changeFigure 已知参数是否存在', () => {
    const sentence = mustParse('changeFigure: figure.png -id=fig-main -left -zIndex=2 -transform={"x":1} -duration=300 -animationFlag -next;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'id')).toBe(true)
    expect(hasCommandNodeParam(node, 'position')).toBe(true)
    expect(hasCommandNodeParam(node, 'zIndex')).toBe(true)
    expect(hasCommandNodeParam(node, 'transform')).toBe(true)
    expect(hasCommandNodeParam(node, 'duration')).toBe(true)
    expect(hasCommandNodeParam(node, 'animationFlag')).toBe(true)
    expect(hasCommandNodeParam(node, 'next')).toBe(true)
    expect(hasCommandNodeParam(node, 'motion')).toBe(false)
  })

  it('检测 setAnimation 已知参数是否存在', () => {
    const sentence = mustParse('setAnimation: bounce -target=fig-left -keep;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'target')).toBe(true)
    expect(hasCommandNodeParam(node, 'keep')).toBe(true)
    expect(hasCommandNodeParam(node, 'next')).toBe(false)
  })

  it('检测 setTempAnimation 已知参数是否存在', () => {
    const sentence = mustParse('setTempAnimation: bounce -target=fig-left -keep;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'target')).toBe(true)
    expect(hasCommandNodeParam(node, 'keep')).toBe(true)
    expect(hasCommandNodeParam(node, 'next')).toBe(false)
  })

  it('检测 setComplexAnimation 已知参数是否存在', () => {
    const sentence = mustParse('setComplexAnimation: universalSoftIn -target=fig-left -duration=500;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'target')).toBe(true)
    expect(hasCommandNodeParam(node, 'duration')).toBe(true)
    expect(hasCommandNodeParam(node, 'next')).toBe(false)
  })

  it('检测 setTransition 已知参数是否存在', () => {
    const sentence = mustParse('setTransition:  -target=fig-left -enter=fadeIn;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'target')).toBe(true)
    expect(hasCommandNodeParam(node, 'enter')).toBe(true)
    expect(hasCommandNodeParam(node, 'exit')).toBe(false)
  })

  it('检测 getUserInput 已知参数是否存在', () => {
    const sentence = mustParse('getUserInput: playerName -title=YourName;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'title')).toBe(true)
    expect(hasCommandNodeParam(node, 'buttonText')).toBe(false)
    expect(hasCommandNodeParam(node, 'default')).toBe(false)
  })

  it('检测 bgm 已知参数是否存在', () => {
    const sentence = mustParse('bgm: bgm.ogg -volume=80 -unlockname=bgm1;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'volume')).toBe(true)
    expect(hasCommandNodeParam(node, 'unlockname')).toBe(true)
    expect(hasCommandNodeParam(node, 'series')).toBe(false)
  })

  it('检测 playEffect 已知参数是否存在', () => {
    const sentence = mustParse('playEffect: click.ogg -volume=70 -id=sfx1;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'volume')).toBe(true)
    expect(hasCommandNodeParam(node, 'id')).toBe(true)
  })

  it('检测 video 已知参数是否存在', () => {
    const sentence = mustParse('playVideo: intro.mp4 -skipOff;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'skipOff')).toBe(true)
  })

  it('检测 callSteam 已知参数是否存在', () => {
    const sentence = mustParse('callSteam:  -achievementId=achv-1 -x=1;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'achievementId')).toBe(true)
    expect(hasCommandNodeParam(node, 'x')).toBe(true)
    expect(hasCommandNodeParam(node, 'achievementIdMissing')).toBe(false)
  })

  it('检测 intro 已知参数是否存在', () => {
    const sentence = mustParse('intro: hello -fontSize=small -delayTime=2000 -hold;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'fontSize')).toBe(true)
    expect(hasCommandNodeParam(node, 'delayTime')).toBe(true)
    expect(hasCommandNodeParam(node, 'hold')).toBe(true)
    expect(hasCommandNodeParam(node, 'userForward')).toBe(false)
    expect(hasCommandNodeParam(node, 'animation')).toBe(false)
  })

  it('检测 unlockCg/unlockBgm 已知参数是否存在', () => {
    const unlockCgSentence = mustParse('unlockCg: cg1.jpg -name=CG1;')
    const unlockCgNode = parseCommandNode(unlockCgSentence)
    expect(hasCommandNodeParam(unlockCgNode, 'name')).toBe(true)
    expect(hasCommandNodeParam(unlockCgNode, 'series')).toBe(false)

    const unlockBgmSentence = mustParse('unlockBgm: bgm1.ogg -series=s1;')
    const unlockBgmNode = parseCommandNode(unlockBgmSentence)
    expect(hasCommandNodeParam(unlockBgmNode, 'name')).toBe(false)
    expect(hasCommandNodeParam(unlockBgmNode, 'series')).toBe(true)
  })

  it('检测通用参数是否存在', () => {
    const sentence = mustParse('miniAvatar: hero -x=100 -y=200;')
    const node = parseCommandNode(sentence)

    expect(hasCommandNodeParam(node, 'x')).toBe(true)
    expect(hasCommandNodeParam(node, 'z')).toBe(false)
  })
})
