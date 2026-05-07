import { AbsPath, RelPath } from '~/domain/path'
import { safeInvoke } from '~/utils/invoke'

export type BackupSourceKind = 'manual-save' | 'auto-save' | 'restore'

export interface BackupEntry {
  /** 项目相对路径，例如 "game/scene/start.txt" */
  sourcePath: string
  /** 备份内容相对 backups 根的路径，例如 "scene/start/2026-03-12T14-30-00.000Z.bak" */
  backupPath: string
  /** ISO 8601 时间戳 */
  timestamp: string
  sizeBytes: number
  /** 内容 SHA-256，前缀 `sha256:` */
  hash: string
  sourceKind: BackupSourceKind
  summary?: string
}

interface ScopedArgs {
  projectPath: AbsPath
  logicalPath: RelPath
}

function createBackup(
  args: ScopedArgs & { sourceKind: BackupSourceKind, force?: boolean, maxVersions?: number },
): Promise<BackupEntry | null> {
  return safeInvoke('create_backup', { force: false, ...args })
}

function listBackups(args: ScopedArgs): Promise<BackupEntry[]> {
  return safeInvoke('list_backups', { ...args })
}

function readBackup(args: { projectPath: AbsPath, backupPath: RelPath }): Promise<string> {
  return safeInvoke('read_backup', { ...args })
}

function restoreBackup(
  args: ScopedArgs & { backupPath: RelPath },
): Promise<BackupEntry | null> {
  return safeInvoke('restore_backup', { ...args })
}

function cleanupBackups(
  args: { projectPath: AbsPath, maxVersions?: number, maxDays?: number },
): Promise<number> {
  return safeInvoke('cleanup_backups', { ...args })
}

function moveBackupHistory(args: {
  projectPath: AbsPath
  oldLogicalPath: RelPath
  newLogicalPath: RelPath
}): Promise<void> {
  return safeInvoke('move_backup_history', { ...args })
}

export const backupCmds = {
  createBackup,
  listBackups,
  readBackup,
  restoreBackup,
  cleanupBackups,
  moveBackupHistory,
}
