import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { LATEST_ENGINE_RUNTIME_CAPABILITIES, LEGACY_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { commandEntries } from '~/features/editor/command-registry'

import {
  buildCommandPanelGroupTagEntries,
  resolveCommandPanelVisibleCommands,
} from '../command-panel'

import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'

describe('commandPanel', () => {
  it('会在全部和语句组视图中返回全部命令，在分类视图中过滤命令', () => {
    const allCommands = resolveCommandPanelVisibleCommands('all')
    const groupCommands = resolveCommandPanelVisibleCommands('groups')
    const performCommands = resolveCommandPanelVisibleCommands('perform')

    expect(groupCommands).toEqual(allCommands)
    expect(performCommands.length).toBeGreaterThan(0)
    expect(performCommands.every(entry => entry.category === 'perform')).toBe(true)
    expect(performCommands.length).toBeLessThan(allCommands.length)
  })

  it('常用视图按收藏顺序复用注册项并忽略重复和失效的命令标识', () => {
    const favoriteCommands = resolveCommandPanelVisibleCommands(
      'favorites',
      ['filmMode', 'say', 'filmMode', 'removed-command'],
    )

    expect(favoriteCommands.map(entry => entry.type)).toEqual([
      commandType.filmMode,
      commandType.say,
    ])
    expect(favoriteCommands.every(entry => commandEntries.includes(entry))).toBe(true)
  })

  it('旧运行时隐藏仅在 Terre 4.6.3 中支持的命令', () => {
    const entries = resolveCommandPanelVisibleCommands(
      'scene',
      [],
      commandEntries,
      LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    )

    expect(entries.map(entry => entry.type)).not.toContain(commandType.return)
  })

  it('立绘差分只在 4.6.5 及以上的运行时的命令面板里出现', () => {
    const typesFor = (capabilities?: EngineRuntimeCapabilities) =>
      resolveCommandPanelVisibleCommands('all', [], commandEntries, capabilities).map(entry => entry.type)

    // 上下文缺失时按最新能力处理，因此首启游戏也能看到该命令
    expect(typesFor(undefined)).toContain(commandType.changeFigureDiff)
    expect(typesFor(LEGACY_ENGINE_RUNTIME_CAPABILITIES)).not.toContain(commandType.changeFigureDiff)
    expect(typesFor(LATEST_ENGINE_RUNTIME_CAPABILITIES)).toContain(commandType.changeFigureDiff)
    // 只缺该能力（如 4.6.4）时同样不出现
    expect(typesFor({ ...LATEST_ENGINE_RUNTIME_CAPABILITIES, changeFigureDiff: false }))
      .not.toContain(commandType.changeFigureDiff)
  })

  it('会按命令标签聚合同类语句组条目', () => {
    const t = ((key: string) => key) as Parameters<typeof buildCommandPanelGroupTagEntries>[1]

    expect(buildCommandPanelGroupTagEntries({
      createdAt: 1,
      id: 'group-1',
      name: 'Demo',
      rawTexts: [
        'say:hello;',
        'say:world;',
        'changeBg:bg.jpg;',
      ],
    }, t)).toEqual([
      {
        count: 2,
        label: 'edit.visualEditor.commands.say',
      },
      {
        count: 1,
        label: 'edit.visualEditor.commands.changeBg',
      },
    ])
  })
})
