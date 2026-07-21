import { describe, expect, it, vi } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { AbsPath } from '~/domain/path'
import { buildArgumentCompletionInfo, buildCommandCompletionInfo, filterCompletionOptions, queryArgumentValueCompletions } from '~/features/editor/command-registry/completion'

const t = (key: string) => key

describe('buildArgumentCompletionInfo', () => {
  function keysFor(command: commandType): string[] {
    return buildArgumentCompletionInfo(command, t).map(item => item.key)
  }

  it('从命令注册表派生参数键、插入形式和说明', () => {
    const input = buildArgumentCompletionInfo(commandType.getUserInput, t)

    expect(input).toContainEqual({
      key: 'ruleButtonText',
      detail: 'edit.visualEditor.params.ruleButtonText',
      simplified: false,
      hasValueCompletions: false,
    })
    expect(buildArgumentCompletionInfo(commandType.wait, t)).toContainEqual({
      key: 'nobreak',
      detail: 'edit.visualEditor.params.nobreak',
      simplified: true,
      hasValueCompletions: false,
    })
    expect(buildArgumentCompletionInfo(commandType.say, t)).toContainEqual(expect.objectContaining({
      key: 'figureId',
      hasValueCompletions: true,
    }))
  })

  it('只向适用的命令推荐新增参数', () => {
    expect(keysFor(commandType.changeBg)).toEqual(expect.arrayContaining(['continue', 'order', 'ignoreDefault']))
    expect(keysFor(commandType.changeBg)).not.toContain('parallel')
    expect(keysFor(commandType.unlockCg)).toContain('order')
    expect(keysFor(commandType.unlockBgm)).not.toContain('order')
    expect(keysFor(commandType.setAnimation)).toEqual(expect.arrayContaining(['continue', 'parallel', 'ignoreDefault']))
  })

  it('保留只属于文本语法的既有补全', () => {
    expect(keysFor(commandType.say)).toEqual(expect.arrayContaining(['when', 'left', 'right', 'center']))
  })

  it('命令候选直接来自注册表并保留脚本关键字', () => {
    const commands = buildCommandCompletionInfo(t)
    expect(commands.map(item => item.commandRaw)).toContain('pixiPerform')
    expect(commands.map(item => item.commandRaw)).toContain('changeBg')
    expect(commands.map(item => item.commandRaw)).not.toContain('comment')
  })

  it('普通 choice 参数值从字段定义投影并支持完整值过滤', async () => {
    const options = await queryArgumentValueCompletions(commandType.setComplexAnimation, 'content', {
      content: 'universal',
    }, t)

    expect(filterCompletionOptions(options, 'universal')).toEqual([
      { label: 'edit.visualEditor.options.universalSoftIn', value: 'universalSoftIn' },
      { label: 'edit.visualEditor.options.universalSoftOff', value: 'universalSoftOff' },
    ])
  })

  it('资源候选使用完整路径，不截断目录前缀', async () => {
    const options = await queryArgumentValueCompletions(commandType.changeBg, 'content', {
      content: 'a/',
      listResources: () => [
        { label: 'a/b.png', value: 'a/b.png' },
        { label: 'a/c.png', value: 'a/c.png' },
      ],
    }, t)

    expect(filterCompletionOptions(options, 'a/').map(item => item.value)).toEqual(['a/b.png', 'a/c.png'])
  })

  it('动态候选使用语句内容作为来源上下文并保留完整值', async () => {
    const resolveDynamicOptions = vi.fn(async (_key, context) => [
      { label: context.content, value: 'a/b' },
      { label: 'other', value: 'a/c' },
    ])
    const options = await queryArgumentValueCompletions(commandType.changeFigure, 'motion', {
      content: 'figures/hero.json',
      gamePath: AbsPath.from('/game'),
      resolveDynamicOptions,
    }, t)

    expect(resolveDynamicOptions).toHaveBeenCalledWith('figureMotions', {
      content: 'figures/hero.json',
      gamePath: AbsPath.from('/game'),
    })
    expect(filterCompletionOptions(options, 'a/').map(item => item.value)).toEqual(['a/b', 'a/c'])
  })

  it('缺少工程路径时不会调用动态候选源', async () => {
    const resolveDynamicOptions = vi.fn()

    const options = await queryArgumentValueCompletions(commandType.changeFigure, 'motion', {
      content: 'figures/hero.json',
      resolveDynamicOptions,
    }, t)

    expect(options).toEqual([])
    expect(resolveDynamicOptions).not.toHaveBeenCalled()
  })

  it('场景 autocomplete 候选复用当前语句集合', async () => {
    const options = await queryArgumentValueCompletions(commandType.say, 'figureId', {
      content: '',
      sceneOptions: {
        figureIds: [{ label: 'hero', value: 'hero' }],
        sceneLabels: [],
        soundEffectIds: [],
      },
    }, t)

    expect(options).toEqual([
      { label: 'edit.visualEditor.options.figureLeft', value: 'fig-left' },
      { label: 'edit.visualEditor.options.figureCenter', value: 'fig-center' },
      { label: 'edit.visualEditor.options.figureRight', value: 'fig-right' },
      { label: 'hero', value: 'hero' },
    ])
  })
})
