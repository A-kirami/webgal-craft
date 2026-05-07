import { AbsPath, RelPath } from '~/domain/path'
import { safeInvoke } from '~/utils/invoke'

import type { VfsDirEntry } from '~/types/project-config'

/** VFS 命令共用的层叠路径参数 */
interface VfsLayerArgs {
  projectPath: AbsPath
  enginePath: AbsPath
  relPath: RelPath
  templatePath?: AbsPath
}

async function resolvePath(args: VfsLayerArgs): Promise<AbsPath> {
  return AbsPath.from(await safeInvoke<string>('resolve_vfs_path', { ...args }))
}

function listDir(args: VfsLayerArgs): Promise<VfsDirEntry[]> {
  return safeInvoke<VfsDirEntry[]>('list_vfs_dir', { ...args })
}

async function ensureWritable(args: VfsLayerArgs): Promise<AbsPath> {
  return AbsPath.from(await safeInvoke<string>('ensure_vfs_writable', { ...args }))
}

function deletePath(args: VfsLayerArgs): Promise<void> {
  return safeInvoke<void>('delete_vfs_path', { ...args })
}

async function renamePath(args: VfsLayerArgs & { newName: string }): Promise<RelPath> {
  return RelPath.from(await safeInvoke<string>('rename_vfs_path', { ...args }))
}

async function movePath(args: VfsLayerArgs & { targetRelPath: RelPath }): Promise<RelPath> {
  return RelPath.from(await safeInvoke<string>('move_vfs_path', { ...args }))
}

async function copyPath(args: VfsLayerArgs & { targetRelPath: RelPath }): Promise<RelPath> {
  return RelPath.from(await safeInvoke<string>('copy_vfs_path', { ...args }))
}

function isTemplateDirty(projectPath: AbsPath): Promise<boolean> {
  return safeInvoke<boolean>('is_template_dirty', { projectPath })
}

function cleanTemplateUpper(projectPath: AbsPath): Promise<void> {
  return safeInvoke<void>('clean_template_upper', { projectPath })
}

export const vfsCmds = {
  resolvePath,
  listDir,
  ensureWritable,
  deletePath,
  renamePath,
  movePath,
  copyPath,
  isTemplateDirty,
  cleanTemplateUpper,
}
