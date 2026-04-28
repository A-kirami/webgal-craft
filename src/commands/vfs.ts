import { safeInvoke } from '~/utils/invoke'

import type { VfsDirEntry } from '~/types/project-config'

/** VFS 命令共用的层叠路径参数 */
interface VfsLayerArgs {
  projectPath: string
  enginePath: string
  relPath: string
  templatePath?: string
}

function resolvePath(args: VfsLayerArgs): Promise<string> {
  return safeInvoke('resolve_vfs_path', { ...args })
}

function listDir(args: VfsLayerArgs): Promise<VfsDirEntry[]> {
  return safeInvoke('list_vfs_dir', { ...args })
}

function ensureWritable(args: VfsLayerArgs): Promise<string> {
  return safeInvoke('ensure_vfs_writable', { ...args })
}

function deletePath(args: VfsLayerArgs): Promise<void> {
  return safeInvoke('delete_vfs_path', { ...args })
}

function renamePath(args: VfsLayerArgs & { newName: string }): Promise<string> {
  return safeInvoke('rename_vfs_path', { ...args })
}

function movePath(args: VfsLayerArgs & { targetRelPath: string }): Promise<string> {
  return safeInvoke('move_vfs_path', { ...args })
}

function copyPath(args: VfsLayerArgs & { targetRelPath: string }): Promise<string> {
  return safeInvoke('copy_vfs_path', { ...args })
}

function isTemplateDirty(projectPath: string): Promise<boolean> {
  return safeInvoke('is_template_dirty', { projectPath })
}

function cleanTemplateUpper(projectPath: string): Promise<void> {
  return safeInvoke('clean_template_upper', { projectPath })
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
