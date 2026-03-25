import { describe, expect, it } from 'vitest'

import {
  buildCommandPanelGroupTagEntries,
  resolveCommandPanelVisibleCommands,
} from '../command-panel'

describe('command panel helper', () => {
  it('会在全部和语句组视图中返回全部命令，在分类视图中过滤命令', () => {
    const allCommands = resolveCommandPanelVisibleCommands('all')
    const groupCommands = resolveCommandPanelVisibleCommands('groups')
    const performCommands = resolveCommandPanelVisibleCommands('perform')

    expect(groupCommands).toEqual(allCommands)
    expect(performCommands.length).toBeGreaterThan(0)
    expect(performCommands.every(entry => entry.category === 'perform')).toBe(true)
    expect(performCommands.length).toBeLessThan(allCommands.length)
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
