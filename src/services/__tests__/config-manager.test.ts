import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import { configManager } from '~/services/config-manager'

const {
  refreshIfCurrentGameMock,
  refreshRegisteredGameSnapshotMock,
  setGameConfigMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  refreshIfCurrentGameMock: vi.fn(),
  refreshRegisteredGameSnapshotMock: vi.fn(),
  setGameConfigMock: vi.fn(),
  loggerErrorMock: vi.fn(),
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

vi.mock(import('@tauri-apps/plugin-log'), () => ({ error: loggerErrorMock }))

describe('configManager', () => {
  beforeEach(() => {
    refreshIfCurrentGameMock.mockReset()
    refreshRegisteredGameSnapshotMock.mockReset()
    setGameConfigMock.mockReset()
    loggerErrorMock.mockReset()
  })

  it('setConfig 会写入配置、刷新已注册游戏快照并触发当前预览重载', async () => {
    await configManager.setConfig(AbsPath.from('/game'), {
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

  it('配置通知在快照和预览刷新后发出，监听器加载不阻塞保存完成', async () => {
    const gamePath = AbsPath.from('/game')
    const config = { entries: [{ key: 'Enable_flowchart', value: 'true' }] }
    let finishListener!: () => void
    const pendingListener = new Promise<void>((resolve) => {
      finishListener = resolve
    })
    const listener = vi.fn(() => pendingListener)
    const { off } = configManager.onConfigChanged(listener)
    let saved = false
    const saving = configManager.setConfig(gamePath, config).then(() => {
      saved = true
    })
    try {
      await vi.waitFor(() => expect(saved).toBe(true))
      expect(listener).toHaveBeenCalledExactlyOnceWith({ gamePath, config })
      expect(refreshRegisteredGameSnapshotMock).toHaveBeenCalledBefore(listener)
      expect(refreshIfCurrentGameMock).toHaveBeenCalledBefore(listener)
    } finally {
      finishListener()
      off()
      await saving
    }
  })

  it('监听器失败不会把已写入的配置报告为保存失败', async () => {
    const error = new Error('监听器失败')
    const { off } = configManager.onConfigChanged(() => Promise.reject(error))
    try {
      await expect(configManager.setConfig(AbsPath.from('/game'), { entries: [] })).resolves.toBeUndefined()
      expect(refreshRegisteredGameSnapshotMock).toHaveBeenCalledWith('/game')
      expect(refreshIfCurrentGameMock).toHaveBeenCalledWith('/game')
      await vi.waitFor(() => expect(loggerErrorMock).toHaveBeenCalledWith(expect.stringContaining('监听器失败')))
    } finally {
      off()
    }
  })
})
