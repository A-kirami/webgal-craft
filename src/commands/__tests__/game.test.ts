import '~/__tests__/setup'

import { afterEach, describe, expect, it, vi } from 'vitest'

const { safeInvokeMock } = vi.hoisted(() => ({
  safeInvokeMock: vi.fn(),
}))

vi.mock('~/utils/invoke', () => ({
  safeInvoke: safeInvokeMock,
}))

import { findGameConfigEntryValue, gameCmds } from '../game'

describe('gameCmds', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('findGameConfigEntryValue 会返回最后一个匹配的 raw entry', () => {
    expect(findGameConfigEntryValue([
      {
        key: 'Game_name',
        value: 'Old Name',
      },
      {
        key: 'Custom_flag',
        value: 'on',
      },
      {
        key: 'Game_name',
        value: 'New Name',
      },
    ], 'Game_name')).toBe('New Name')
  })

  it('getGameConfig 会返回统一的 raw entries 结果', async () => {
    safeInvokeMock.mockResolvedValue({
      entries: [
        {
          key: 'Game_name',
          value: 'Demo Game',
        },
        {
          key: 'Stage_Width',
          value: '1280',
        },
        {
          key: 'Custom_flag',
          value: 'on',
        },
      ],
      unmanagedLineCount: 1,
    })

    await expect(gameCmds.getGameConfig('/games/demo')).resolves.toEqual({
      entries: [
        {
          key: 'Game_name',
          value: 'Demo Game',
        },
        {
          key: 'Stage_Width',
          value: '1280',
        },
        {
          key: 'Custom_flag',
          value: 'on',
        },
      ],
      unmanagedLineCount: 1,
    })
    expect(safeInvokeMock).toHaveBeenCalledWith('get_game_config', { gamePath: '/games/demo' })
  })

  it('setGameConfig 会直接透传统一 entries payload', async () => {
    safeInvokeMock.mockResolvedValue(undefined)

    await gameCmds.setGameConfig('/games/demo', {
      entries: [
        {
          key: 'Game_name',
          value: 'Renamed Game',
        },
        {
          key: 'Custom_flag',
          value: 'on',
        },
      ],
    })

    expect(safeInvokeMock).toHaveBeenCalledTimes(1)
    expect(safeInvokeMock).toHaveBeenCalledWith('set_game_config', {
      gamePath: '/games/demo',
      config: {
        entries: [
          {
            key: 'Game_name',
            value: 'Renamed Game',
          },
          {
            key: 'Custom_flag',
            value: 'on',
          },
        ],
      },
    })
  })

  it('getGameConfig 在返回旧版扁平结构时会拒绝解析', async () => {
    safeInvokeMock.mockResolvedValue({
      entries: Object.fromEntries([
        ['Game_name', 'Demo Game'],
      ]),
    })

    await expect(gameCmds.getGameConfig('/games/demo')).rejects.toThrow()
  })

  it('getGameConfig 在返回值缺失必需字段时会拒绝解析', async () => {
    safeInvokeMock.mockResolvedValue({
      entries: [
        {
          key: 'Game_name',
          value: 'Demo Game',
        },
      ],
    })

    await expect(gameCmds.getGameConfig('/games/demo')).rejects.toThrow()
  })
})
