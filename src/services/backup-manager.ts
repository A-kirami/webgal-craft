import { backupCmds } from '~/commands/backup'
import { AbsPath, RelPath } from '~/domain/path'
import { useBackupSettingsStore } from '~/stores/backup-settings'

import type { BackupEntry, BackupSourceKind } from '~/commands/backup'

const SCENE_PATH_PREFIX = 'game/scene/'
const SCENE_FILE_EXT = '.txt'

/**
 * 仅当 logicalPath 是项目相对路径、位于 `game/scene/` 下且为 `.txt` 文件时返回 true。
 */
export function isScenePath(logicalPath: RelPath): boolean {
  return logicalPath.startsWith(SCENE_PATH_PREFIX) && logicalPath.endsWith(SCENE_FILE_EXT)
}

/**
 * 将 `<projectPath>/<logical>` 形式的绝对路径转为项目相对路径。
 * 若 absolutePath 不在 projectPath 之下则返回 undefined。
 */
export function toProjectRelative(
  projectPath: AbsPath,
  absolutePath: AbsPath,
): RelPath | undefined {
  if (AbsPath.equals(absolutePath, projectPath)) {
    return RelPath.empty()
  }

  try {
    return AbsPath.relativize(absolutePath, projectPath)
  } catch {
    return undefined
  }
}

interface CreateBackupOptions {
  sourceKind: BackupSourceKind
  /** force=true 绕过最小间隔，仅保留哈希去重；用于手动保存 */
  force: boolean
}

async function createSceneBackup(
  projectPath: AbsPath,
  logicalPath: RelPath,
  options: CreateBackupOptions,
): Promise<BackupEntry | undefined> {
  if (!isScenePath(logicalPath)) {
    return undefined
  }
  // 把 maxVersions 直接交给后端在 create 时做 in-band 裁剪，避免每次保存都触发全量孤儿扫描
  const settings = useBackupSettingsStore()
  const entry = await backupCmds.createBackup({
    projectPath,
    logicalPath,
    ...options,
    maxVersions: settings.maxVersions,
  })
  return entry ?? undefined
}

function createManualBackup(projectPath: AbsPath, logicalPath: RelPath) {
  return createSceneBackup(projectPath, logicalPath, { sourceKind: 'manual-save', force: true })
}

function createAutoBackup(projectPath: AbsPath, logicalPath: RelPath) {
  return createSceneBackup(projectPath, logicalPath, { sourceKind: 'auto-save', force: false })
}

async function loadTimeline(projectPath: AbsPath, logicalPath: RelPath): Promise<BackupEntry[]> {
  if (!isScenePath(logicalPath)) {
    return []
  }
  // 仅在用户主动查看历史时跑一次按天保留与孤儿扫描——这是天然低频路径
  const settings = useBackupSettingsStore()
  await backupCmds.cleanupBackups({
    projectPath,
    maxVersions: settings.maxVersions,
    maxDays: settings.maxDays,
  })
  return backupCmds.listBackups({ projectPath, logicalPath })
}

function readBackupContent(projectPath: AbsPath, backupPath: RelPath): Promise<string> {
  return backupCmds.readBackup({ projectPath, backupPath })
}

function restoreBackup(projectPath: AbsPath, logicalPath: RelPath, backupPath: RelPath) {
  return backupCmds.restoreBackup({ projectPath, logicalPath, backupPath })
}

/**
 * 在 VFS rename / move 物理移动成功后调用，原子迁移历史目录与 manifest。
 * 若两端均非 scene，则不做任何操作；
 * 目标若已有独立历史，按 VS Code Local History 语义直接覆盖（由后端处理）。
 */
async function moveSceneHistory(
  projectPath: AbsPath,
  oldLogicalPath: RelPath,
  newLogicalPath: RelPath,
): Promise<void> {
  if (!isScenePath(oldLogicalPath) || !isScenePath(newLogicalPath)) {
    return
  }
  await backupCmds.moveBackupHistory({ projectPath, oldLogicalPath, newLogicalPath })
}

export const backupManager = {
  isScenePath,
  toProjectRelative,
  createManualBackup,
  createAutoBackup,
  loadTimeline,
  readBackupContent,
  restoreBackup,
  moveSceneHistory,
}
