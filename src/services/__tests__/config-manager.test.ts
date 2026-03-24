import { beforeEach, describe, expect, it, vi } from 'vitest'

import { configManager } from '~/services/config-manager'

const {
  getGameConfigMock,
  setGameConfigMock,
  updateCurrentGameLastModifiedMock,
} = vi.hoisted(() => ({
  getGameConfigMock: vi.fn(),
  setGameConfigMock: vi.fn(),
  updateCurrentGameLastModifiedMock: vi.fn(),
}))

vi.mock('~/commands/game', () => ({
  gameCmds: {
    getGameConfig: getGameConfigMock,
    setGameConfig: setGameConfigMock,
  },
}))

vi.mock('../commands/game', () => ({
  gameCmds: {
    getGameConfig: getGameConfigMock,
    setGameConfig: setGameConfigMock,
  },
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    updateCurrentGameLastModified: updateCurrentGameLastModifiedMock,
  },
}))

vi.mock('./game-manager', () => ({
  gameManager: {
    updateCurrentGameLastModified: updateCurrentGameLastModifiedMock,
  },
}))

describe('configManager', () => {
  beforeEach(() => {
    getGameConfigMock.mockReset()
    setGameConfigMock.mockReset()
    updateCurrentGameLastModifiedMock.mockReset()
  })

  it('getConfig 会代理到 gameCmds.getGameConfig', async () => {
    getGameConfigMock.mockResolvedValue({ gameName: 'Demo' })

    await expect(configManager.getConfig('/game')).resolves.toEqual({ gameName: 'Demo' })
    expect(getGameConfigMock).toHaveBeenCalledWith('/game')
  })

  it('setConfig 会写入配置并更新当前游戏时间戳', async () => {
    await configManager.setConfig('/game', { gameName: 'Renamed' })

    expect(setGameConfigMock).toHaveBeenCalledWith('/game', { gameName: 'Renamed' })
    expect(updateCurrentGameLastModifiedMock).toHaveBeenCalledTimes(1)
  })
})
