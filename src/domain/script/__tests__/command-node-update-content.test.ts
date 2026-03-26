import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseCommandNode, serializeCommandNode } from '~/domain/script/codec'
import { updateCommandNodeContent } from '~/domain/script/update'

import { mustParse } from './utils'

describe('命令节点内容更新', () => {
  it('通过解析内容对更新 setVar 节点', () => {
    const sentence = mustParse('setVar: score=10 -global;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'hp=88')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.setVar)
    expect(serialized.content).toBe('hp=88')
    expect(serialized.args).toEqual([{ key: 'global', value: true }])
  })

  it('直接更新 comment 内容', () => {
    const sentence = mustParse('; old comment')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'new comment')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.comment)
    expect(serialized.content).toBe('new comment')
    expect(serialized.args).toEqual([{ key: 'next', value: true }])
  })

  it('通过解析选项列表更新 choose 节点', () => {
    const sentence = mustParse('choose: A:scene1.txt|B:scene2.txt;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'C:scene3.txt|D:scene4.txt')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.choose)
    expect(serialized.content).toBe('C:scene3.txt|D:scene4.txt')
  })

  it('通过解析样式规则更新 applyStyle 节点', () => {
    const sentence = mustParse('applyStyle: old->new,foo->bar;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'a->b,c->d')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.applyStyle)
    expect(serialized.content).toBe('a->b,c->d')
  })

  it('直接更新 setTransform 内容', () => {
    const sentence = mustParse('setTransform: {"alpha":1} -target=fig-left;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, '{"alpha":0.5}')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.setTransform)
    expect(serialized.content).toBe('{"alpha":0.5}')
    expect(serialized.args).toEqual([{ key: 'target', value: 'fig-left' }])
  })

  it('直接更新 changeFigure 内容', () => {
    const sentence = mustParse('changeFigure: old.png -id=fig-main -left;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'new.png')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.changeFigure)
    expect(serialized.content).toBe('new.png')
    expect(serialized.args).toEqual([
      { key: 'id', value: 'fig-main' },
      { key: 'left', value: true },
    ])
  })

  it('直接更新 setAnimation 内容', () => {
    const sentence = mustParse('setAnimation: bounce -target=fig-left;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'shake')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.setAnimation)
    expect(serialized.content).toBe('shake')
    expect(serialized.args).toEqual([{ key: 'target', value: 'fig-left' }])
  })

  it('直接更新 setTempAnimation 内容', () => {
    const sentence = mustParse('setTempAnimation: bounce -target=fig-left;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'shake')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.setTempAnimation)
    expect(serialized.content).toBe('shake')
    expect(serialized.args).toEqual([{ key: 'target', value: 'fig-left' }])
  })

  it('直接更新 setComplexAnimation 内容', () => {
    const sentence = mustParse('setComplexAnimation: universalSoftIn -target=fig-left;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'universalSoftOff')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.setComplexAnimation)
    expect(serialized.content).toBe('universalSoftOff')
    expect(serialized.args).toEqual([{ key: 'target', value: 'fig-left' }])
  })

  it('直接更新 getUserInput 内容', () => {
    const sentence = mustParse('getUserInput: playerName -title=YourName;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'heroName')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.getUserInput)
    expect(serialized.content).toBe('heroName')
    expect(serialized.args).toEqual([{ key: 'title', value: 'YourName' }])
  })

  it('直接更新 bgm 内容', () => {
    const sentence = mustParse('bgm: old.ogg -volume=80;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'new.ogg')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.bgm)
    expect(serialized.content).toBe('new.ogg')
    expect(serialized.args).toEqual([{ key: 'volume', value: 80 }])
  })

  it('直接更新 playEffect 内容', () => {
    const sentence = mustParse('playEffect: click.ogg -id=sfx1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'beep.ogg')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.playEffect)
    expect(serialized.content).toBe('beep.ogg')
    expect(serialized.args).toEqual([{ key: 'id', value: 'sfx1' }])
  })

  it('直接更新 video 内容', () => {
    const sentence = mustParse('playVideo: old.mp4 -skipOff;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'new.mp4')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.video)
    expect(serialized.content).toBe('new.mp4')
    expect(serialized.args).toEqual([{ key: 'skipOff', value: true }])
  })

  it('直接更新 pixi 内容', () => {
    const sentence = mustParse('pixiPerform: rain -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'snow')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.pixi)
    expect(serialized.content).toBe('snow')
    expect(serialized.args).toEqual([{ key: 'x', value: 1 }])
  })

  it('直接更新 changeScene 内容', () => {
    const sentence = mustParse('changeScene: chapter1.txt -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'chapter2.txt')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.changeScene)
    expect(serialized.content).toBe('chapter2.txt')
    expect(serialized.args).toEqual([{ key: 'x', value: 1 }])
  })

  it('直接更新 callScene 内容', () => {
    const sentence = mustParse('callScene: sub1.txt -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'sub2.txt')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.callScene)
    expect(serialized.content).toBe('sub2.txt')
    expect(serialized.args).toEqual([{ key: 'x', value: 1 }])
  })

  it('直接更新 wait 内容', () => {
    const sentence = mustParse('wait: 1000 -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, '1200')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.wait)
    expect(serialized.content).toBe('1200')
    expect(serialized.args).toEqual([{ key: 'x', value: 1 }])
  })

  it('直接更新 intro 内容', () => {
    const sentence = mustParse('intro: old text -fontSize=small -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'new text')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.intro)
    expect(serialized.content).toBe('new text')
    expect(serialized.args).toEqual([
      { key: 'fontSize', value: 'small' },
      { key: 'x', value: 1 },
    ])
  })

  it('直接更新 setTextbox 内容', () => {
    const sentence = mustParse('setTextbox: show -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'hide')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.setTextbox)
    expect(serialized.content).toBe('hide')
    expect(serialized.args).toEqual([{ key: 'x', value: 1 }])
  })

  it('直接更新 filmMode 内容', () => {
    const sentence = mustParse('filmMode: on -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'off')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.filmMode)
    expect(serialized.content).toBe('off')
    expect(serialized.args).toEqual([{ key: 'x', value: 1 }])
  })

  it('直接更新 miniAvatar 内容', () => {
    const sentence = mustParse('miniAvatar: hero-old.png -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'hero-new.png')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.miniAvatar)
    expect(serialized.content).toBe('hero-new.png')
    expect(serialized.args).toEqual([{ key: 'x', value: 1 }])
  })

  it('直接更新 label 内容', () => {
    const sentence = mustParse('label: start -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'next-step')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.label)
    expect(serialized.content).toBe('next-step')
    expect(serialized.args).toEqual([{ key: 'x', value: 1 }])
  })

  it('直接更新 jumpLabel 内容', () => {
    const sentence = mustParse('jumpLabel: start -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'next-step')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.jumpLabel)
    expect(serialized.content).toBe('next-step')
    expect(serialized.args).toEqual([{ key: 'x', value: 1 }])
  })

  it('直接更新 unlockCg 内容', () => {
    const sentence = mustParse('unlockCg: cg1.jpg -name=CG1 -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'cg2.jpg')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.unlockCg)
    expect(serialized.content).toBe('cg2.jpg')
    expect(serialized.args).toEqual([
      { key: 'name', value: 'CG1' },
      { key: 'x', value: 1 },
    ])
  })

  it('直接更新 unlockBgm 内容', () => {
    const sentence = mustParse('unlockBgm: bgm1.ogg -name=BGM1 -x=1;')
    const node = parseCommandNode(sentence)
    const updated = updateCommandNodeContent(node, 'bgm2.ogg')
    const serialized = serializeCommandNode(updated)

    expect(serialized.command).toBe(commandType.unlockBgm)
    expect(serialized.content).toBe('bgm2.ogg')
    expect(serialized.args).toEqual([
      { key: 'name', value: 'BGM1' },
      { key: 'x', value: 1 },
    ])
  })
})
