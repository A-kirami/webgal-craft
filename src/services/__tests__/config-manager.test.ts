import { beforeEach, describe, expect, it, vi } from 'vitest'

import { configManager } from '~/services/config-manager'

const {
  refreshIfCurrentGameMock,
  refreshRegisteredGameSnapshotMock,
  setGameConfigMock,
} = vi.hoisted(() => ({
  refreshIfCurrentGameMock: vi.fn(),
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

vi.mock('~/stores/preview-session', () => ({
  usePreviewSessionStore: () => ({
    refreshIfCurrentGame: refreshIfCurrentGameMock,
  }),
}))

describe('configManager 配置管理', () => {
  beforeEach(() => {
    refreshIfCurrentGameMock.mockReset()
    refreshRegisteredGameSnapshotMock.mockReset()
    setGameConfigMock.mockReset()
  })

  it('setConfig 会写入配置、刷新已注册游戏快照并触发当前预览重载', async () => {
    await configManager.setConfig('/game', {
      entries: [
        {
          key: 'Game_name',
          value: 'Renamed',
        },
      ],
    })

    expect(setGameConfigMock).toHaveBeenCalledWith('/game', {
      entries: [
        {
          key: 'Game_name',
          value: 'Renamed',
        },
      ],
    })
    expect(refreshRegisteredGameSnapshotMock).toHaveBeenCalledWith('/game')
    expect(refreshIfCurrentGameMock).toHaveBeenCalledWith('/game')
  })
})
