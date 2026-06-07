import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestGame } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'
import { resourceReconcile } from '~/services/resource-reconcile'

const {
  dbGamesToArrayMock,
  dbGamesUpdateMock,
  gameInspectMock,
} = vi.hoisted(() => ({
  dbGamesToArrayMock: vi.fn(),
  dbGamesUpdateMock: vi.fn(),
  gameInspectMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: vi.fn(),
}))

vi.mock('~/database/db', () => ({
  db: {
    games: {
      toArray: dbGamesToArrayMock,
      update: dbGamesUpdateMock,
    },
  },
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    inspectGame: gameInspectMock,
  },
}))

vi.mock('~/services/engine-manager', () => ({
  engineManager: {
    inspectEngine: vi.fn(),
  },
}))

vi.mock('~/services/template-manager', () => ({
  templateManager: {
    inspectTemplateAvailability: vi.fn(),
  },
}))

describe('resourceReconcile', () => {
  beforeEach(() => {
    dbGamesToArrayMock.mockReset()
    dbGamesUpdateMock.mockReset()
    gameInspectMock.mockReset()
  })

  it('reconcileAllGames 遇到多个游戏校验异常时会返回失败摘要', async () => {
    dbGamesToArrayMock.mockResolvedValue([
      createTestGame({
        id: 'game-1',
        path: AbsPath.from('/games/first'),
      }),
      createTestGame({
        id: 'game-2',
        path: AbsPath.from('/games/second'),
      }),
    ])
    gameInspectMock.mockImplementation(async (path: AbsPath) => {
      if (path === '/games/first') {
        throw new Error('disk unavailable')
      }
      throw new Error('permission denied')
    })

    await expect(resourceReconcile.reconcileAllGames()).resolves.toEqual({
      failed: 2,
      failures: [
        { error: 'Error: disk unavailable', path: '/games/first' },
        { error: 'Error: permission denied', path: '/games/second' },
      ],
      total: 2,
    })
    expect(dbGamesUpdateMock).toHaveBeenCalledWith('game-1', { availability: 'broken' })
    expect(dbGamesUpdateMock).toHaveBeenCalledWith('game-2', { availability: 'broken' })
  })
})
