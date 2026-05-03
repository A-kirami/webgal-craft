import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBackupStore } from '~/stores/backup'

const { loadTimelineMock, restoreBackupMock } = vi.hoisted(() => ({
  loadTimelineMock: vi.fn(),
  restoreBackupMock: vi.fn(),
}))

vi.mock('~/services/backup-manager', () => ({
  backupManager: {
    loadTimeline: loadTimelineMock,
    restoreBackup: restoreBackupMock,
  },
}))

beforeEach(() => {
  loadTimelineMock.mockReset().mockResolvedValue([])
  restoreBackupMock.mockReset().mockResolvedValue({ sourceKind: 'restore' })
})

describe('useBackupStore', () => {
  it('按 scene 路径加载时间线并暴露 sourceKind', async () => {
    loadTimelineMock.mockResolvedValue([
      { sourceKind: 'manual-save', backupPath: 'scene/start/a.bak' },
    ])

    const store = useBackupStore()
    await store.loadTimeline('/games/demo', 'game/scene/start.txt')

    expect(store.timeline[0]?.sourceKind).toBe('manual-save')
    expect(store.scope).toEqual({
      projectPath: '/games/demo',
      logicalPath: 'game/scene/start.txt',
    })
  })

  it('恢复历史条目后会刷新时间线', async () => {
    const store = useBackupStore()
    await store.loadTimeline('/games/demo', 'game/scene/start.txt')

    loadTimelineMock.mockResolvedValue([
      { sourceKind: 'restore', backupPath: 'scene/start/r.bak' },
      { sourceKind: 'manual-save', backupPath: 'scene/start/a.bak' },
    ])

    await store.restoreEntry({
      sourcePath: 'game/scene/start.txt',
      backupPath: 'scene/start/a.bak',
      timestamp: '2026-03-12T14:30:00.000Z',
      sizeBytes: 1,
      hash: 'sha256:0',
      sourceKind: 'manual-save',
    })

    expect(restoreBackupMock).toHaveBeenCalledWith(
      '/games/demo',
      'game/scene/start.txt',
      'scene/start/a.bak',
    )
    expect(store.timeline[0]?.sourceKind).toBe('restore')
  })

  it('clearTimeline 会重置 scope 与时间线', async () => {
    loadTimelineMock.mockResolvedValue([{ sourceKind: 'manual-save', backupPath: 'a.bak' }])

    const store = useBackupStore()
    await store.loadTimeline('/games/demo', 'game/scene/start.txt')
    store.clearTimeline()

    expect(store.scope).toBeUndefined()
    expect(store.timeline).toEqual([])
  })
})
