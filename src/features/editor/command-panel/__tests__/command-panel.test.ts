import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { LEGACY_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { commandEntries } from '~/features/editor/command-registry'

import {
  buildCommandPanelGroupTagEntries,
  resolveCommandPanelVisibleCommands,
} from '../command-panel'

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
