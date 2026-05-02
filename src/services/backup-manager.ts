import { backupCmds } from '~/commands/backup'
import { useBackupSettingsStore } from '~/stores/backup-settings'

import type { BackupEntry, BackupSourceKind } from '~/commands/backup'

const SCENE_PATH_PREFIX = 'game/scene/'
const SCENE_FILE_EXT = '.txt'

function normalize(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '')
}

/**
 * 仅当 logicalPath 是项目相对路径、位于 `game/scene/` 下且为 `.txt` 文件时返回 true。
 */
export function isScenePath(logicalPath: string): boolean {
  return logicalPath.startsWith(SCENE_PATH_PREFIX) && logicalPath.endsWith(SCENE_FILE_EXT)
}

/**
 * 将 `<projectPath>/<logical>` 形式的绝对路径转为项目相对路径。
 * 若 absolutePath 不在 projectPath 之下则返回 undefined。
 */
export function toProjectRelative(
  projectPath: string,
  absolutePath: string,
): string | undefined {
  const project = normalize(projectPath)
  const target = normalize(absolutePath)
  if (target === project) {
    return ''
  }
  if (!target.startsWith(`${project}/`)) {
    return undefined
  }
  return target.slice(project.length + 1)
}

interface CreateBackupOptions {
  sourceKind: BackupSourceKind
  /** force=true 绕过最小间隔，仅保留哈希去重；用于手动保存 */
  force: boolean
}

async function createSceneBackup(
  projectPath: string,
  logicalPath: string,
  options: CreateBackupOptions,
): Promise<BackupEntry | undefined> {
  if (!isScenePath(logicalPath)) {
    return undefined
  }
  const entry = await backupCmds.createBackup({ projectPath, logicalPath, ...options })
  // 后端返回 null 表示被去重策略跳过；不再触发 cleanup，避免无谓 I/O
  if (!entry) {
    return undefined
  }
  const settings = useBackupSettingsStore()
  await backupCmds.cleanupBackups({
    projectPath,
    maxVersions: settings.maxVersions,
    maxDays: settings.maxDays,
  })
  return entry
}

function createManualBackup(projectPath: string, logicalPath: string) {
  return createSceneBackup(projectPath, logicalPath, { sourceKind: 'manual-save', force: true })
}

function createAutoBackup(projectPath: string, logicalPath: string) {
  return createSceneBackup(projectPath, logicalPath, { sourceKind: 'auto-save', force: false })
}

function loadTimeline(projectPath: string, logicalPath: string): Promise<BackupEntry[]> {
  if (!isScenePath(logicalPath)) {
    return Promise.resolve([])
  }
  return backupCmds.listBackups({ projectPath, logicalPath })
}

function readBackupContent(projectPath: string, backupPath: string): Promise<string> {
  return backupCmds.readBackup({ projectPath, backupPath })
}

function restoreBackup(projectPath: string, logicalPath: string, backupPath: string) {
  return backupCmds.restoreBackup({ projectPath, logicalPath, backupPath })
}

/**
 * 在 VFS rename / move 物理移动成功后调用，原子迁移历史目录与 manifest。
 * 若两端均非 scene，则不做任何操作；
 * 目标若已有独立历史，按 VS Code Local History 语义直接覆盖（由后端处理）。
 */
async function moveSceneHistory(
  projectPath: string,
  oldLogicalPath: string,
  newLogicalPath: string,
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
