import { beforeEach, describe, expect, it, vi } from 'vitest'

import { configManager } from '~/services/config-manager'

const {
  refreshRegisteredGameSnapshotMock,
  setGameConfigMock,
} = vi.hoisted(() => ({
  refreshRegisteredGameSnapshotMock: vi.fn(),
  setGameConfigMock: vi.fn(),
}))

vi.mock('~/commands/game', () => ({
  gameCmds: {
    setGameConfig: setGameConfigMock,
  },
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    refreshRegisteredGameSnapshot: refreshRegisteredGameSnapshotMock,
  },
}))

describe('configManager 配置管理', () => {
  beforeEach(() => {
    refreshRegisteredGameSnapshotMock.mockReset()
    setGameConfigMock.mockReset()
  })

  it('setConfig 会写入配置并刷新已注册游戏快照', async () => {
    await configManager.setConfig('/game', {
      set: { gameName: 'Renamed' },
      unset: [],
    })

    expect(setGameConfigMock).toHaveBeenCalledWith('/game', {
      set: { gameName: 'Renamed' },
      unset: [],
    })
    expect(refreshRegisteredGameSnapshotMock).toHaveBeenCalledWith('/game')
  })
})
