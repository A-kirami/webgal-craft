import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath, RelPath } from '~/domain/path'
import { backupManager, isScenePath } from '~/services/backup-manager'
import { useBackupSettingsStore } from '~/stores/backup-settings'

const {
  cleanupBackupsMock,
  createBackupMock,
  listBackupsMock,
  moveBackupHistoryMock,
  readBackupMock,
  restoreBackupMock,
} = vi.hoisted(() => ({
  cleanupBackupsMock: vi.fn(),
  createBackupMock: vi.fn(),
  listBackupsMock: vi.fn(),
  moveBackupHistoryMock: vi.fn(),
  readBackupMock: vi.fn(),
  restoreBackupMock: vi.fn(),
}))

vi.mock('~/commands/backup', () => ({
  backupCmds: {
    cleanupBackups: cleanupBackupsMock,
    createBackup: createBackupMock,
    listBackups: listBackupsMock,
    moveBackupHistory: moveBackupHistoryMock,
    readBackup: readBackupMock,
    restoreBackup: restoreBackupMock,
  },
}))

beforeEach(() => {
  cleanupBackupsMock.mockReset().mockResolvedValue(0)
  createBackupMock.mockReset().mockResolvedValue({ sourceKind: 'manual-save' })
  listBackupsMock.mockReset().mockResolvedValue([])
  moveBackupHistoryMock.mockReset().mockResolvedValue(undefined)
  readBackupMock.mockReset().mockResolvedValue('content')
  restoreBackupMock.mockReset().mockResolvedValue({ sourceKind: 'restore' })
})

describe('backupManager.isScenePath', () => {
  it('仅匹配项目相对路径下的 game/scene/*.txt', () => {
    expect(isScenePath(RelPath.from('game/scene/start.txt'))).toBe(true)
    expect(isScenePath(RelPath.from('game/scene/sub/intro.txt'))).toBe(true)
    expect(isScenePath(RelPath.from('game/scene/start.bak'))).toBe(false)
    expect(isScenePath(RelPath.from('game/figure/foo.png'))).toBe(false)
    expect(isScenePath(RelPath.from('game/scenes.txt'))).toBe(false)
    expect(isScenePath(RelPath.from('game/scene'))).toBe(false)
  })
})

describe('backupManager.createManualBackup', () => {
  it('为 scene 文件创建 manual-save 历史，强制绕过最小间隔，并把 maxVersions 交给后端 in-band 裁剪', async () => {
    const settings = useBackupSettingsStore()
    await backupManager.createManualBackup(AbsPath.from('/games/demo'), RelPath.from('game/scene/start.txt'))

    expect(createBackupMock).toHaveBeenCalledWith({
      projectPath: '/games/demo',
      logicalPath: 'game/scene/start.txt',
      sourceKind: 'manual-save',
      force: true,
      maxVersions: settings.maxVersions,
    })
  })

  it('保存路径不再触发全量 cleanup', async () => {
    await backupManager.createManualBackup(AbsPath.from('/games/demo'), RelPath.from('game/scene/start.txt'))

    expect(cleanupBackupsMock).not.toHaveBeenCalled()
  })

  it('对非 scene 路径直接跳过', async () => {
    const result = await backupManager.createManualBackup(AbsPath.from('/games/demo'), RelPath.from('game/figure/foo.png'))

    expect(result).toBeUndefined()
    expect(createBackupMock).not.toHaveBeenCalled()
  })
})

describe('backupManager.createAutoBackup', () => {
  it('使用 force=false，让后端按 5 分钟最小间隔与哈希去重', async () => {
    const settings = useBackupSettingsStore()
    await backupManager.createAutoBackup(AbsPath.from('/games/demo'), RelPath.from('game/scene/start.txt'))

    expect(createBackupMock).toHaveBeenCalledWith({
      projectPath: '/games/demo',
      logicalPath: 'game/scene/start.txt',
      sourceKind: 'auto-save',
      force: false,
      maxVersions: settings.maxVersions,
    })
  })
})

describe('backupManager.moveSceneHistory', () => {
  it('以项目相对路径调用后端迁移命令', async () => {
    await backupManager.moveSceneHistory(
      AbsPath.from('/games/demo'),
      RelPath.from('game/scene/a.txt'),
      RelPath.from('game/scene/b.txt'),
    )

    expect(moveBackupHistoryMock).toHaveBeenCalledWith({
      projectPath: AbsPath.from('/games/demo'),
      oldLogicalPath: RelPath.from('game/scene/a.txt'),
      newLogicalPath: RelPath.from('game/scene/b.txt'),
    })
  })

  it('对非 scene 路径不触发任何后端调用', async () => {
    await backupManager.moveSceneHistory(
      AbsPath.from('/games/demo'),
      RelPath.from('game/figure/a.png'),
      RelPath.from('game/figure/b.png'),
    )

    expect(moveBackupHistoryMock).not.toHaveBeenCalled()
  })
})

describe('backupManager.loadTimeline / readBackupContent', () => {
  it('对 scene 路径调用 list_backups 并返回历史条目', async () => {
    listBackupsMock.mockResolvedValue([{ sourceKind: 'manual-save' }])

    const entries = await backupManager.loadTimeline(AbsPath.from('/games/demo'), RelPath.from('game/scene/start.txt'))

    expect(entries[0]?.sourceKind).toBe('manual-save')
  })

  it('打开历史时机顺带触发按天保留与孤儿清理', async () => {
    const settings = useBackupSettingsStore()
    await backupManager.loadTimeline(AbsPath.from('/games/demo'), RelPath.from('game/scene/start.txt'))

    expect(cleanupBackupsMock).toHaveBeenCalledWith({
      projectPath: AbsPath.from('/games/demo'),
      maxVersions: settings.maxVersions,
      maxDays: settings.maxDays,
    })
  })

  it('对非 scene 路径返回空时间线', async () => {
    const entries = await backupManager.loadTimeline(AbsPath.from('/games/demo'), RelPath.from('game/figure/foo.png'))

    expect(entries).toEqual([])
    expect(listBackupsMock).not.toHaveBeenCalled()
    expect(cleanupBackupsMock).not.toHaveBeenCalled()
  })

  it('readBackupContent 透传到后端 read_backup', async () => {
    readBackupMock.mockResolvedValue('hello')

    const text = await backupManager.readBackupContent(
      AbsPath.from('/games/demo'),
      RelPath.from('scene/start/2026-03-12T14-30-00.000Z.bak'),
    )

    expect(text).toBe('hello')
    expect(readBackupMock).toHaveBeenCalledWith({
      projectPath: AbsPath.from('/games/demo'),
      backupPath: RelPath.from('scene/start/2026-03-12T14-30-00.000Z.bak'),
    })
  })
})
