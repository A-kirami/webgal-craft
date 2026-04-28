import { safeInvoke } from '~/utils/invoke'

import type { VfsDirEntry } from '~/types/project-config'

/** VFS 命令共用的层叠路径参数 */
interface VfsLayerArgs {
  projectPath: string
  enginePath: string
  relPath: string
  templatePath?: string
}

function resolvePath(projectPath: string, enginePath: string, relPath: string, templatePath?: string): Promise<string> {
  return safeInvoke('resolve_vfs_path', { projectPath, enginePath, templatePath, relPath })
}

function listDir(projectPath: string, enginePath: string, relPath: string, templatePath?: string): Promise<VfsDirEntry[]> {
  return safeInvoke('list_vfs_dir', { projectPath, enginePath, templatePath, relPath })
}

function ensureWritable(projectPath: string, enginePath: string, relPath: string, templatePath?: string): Promise<string> {
  return safeInvoke('ensure_vfs_writable', { projectPath, enginePath, templatePath, relPath })
}

function deletePath(projectPath: string, enginePath: string, relPath: string, templatePath?: string): Promise<void> {
  return safeInvoke('delete_vfs_path', { projectPath, enginePath, templatePath, relPath })
}

function renamePath(projectPath: string, enginePath: string, relPath: string, newName: string, templatePath?: string): Promise<string> {
  return safeInvoke('rename_vfs_path', { projectPath, enginePath, templatePath, relPath, newName })
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
