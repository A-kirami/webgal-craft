import { mkdir, readFile, writeFile as writeBinaryFile, writeTextFile } from '@tauri-apps/plugin-fs'

import { fsCmds } from '~/commands/fs'
import { vfsCmds } from '~/commands/vfs'
import { AbsPath, RelPath } from '~/domain/path'
import { isSceneEntryPath } from '~/domain/scene/entry-point'
import {
  commitPendingFileWrite,
  registerPendingFileWrite,
  rollbackPendingFileWrite,
} from '~/services/file-write-echo-registry'
import { gameManager } from '~/services/game-manager'
import { gameSceneDir } from '~/services/platform/app-paths'
import { useFileStore } from '~/stores/file'
import { useRuntimeTaskStore } from '~/stores/runtime-task'
import { useWorkspaceStore } from '~/stores/workspace'
import { AppError } from '~/types/errors'
import { buildUniqueEntryName } from '~/utils/entry-name'

import type { GamePreviewInvalidation } from '~/services/game-manager'
import type { PathMutationResult } from '~/services/path-mutation'

async function resolveWritablePath(path: AbsPath): Promise<AbsPath> {
  const fileStore = useFileStore()
  return fileStore.isVfs
    ? fileStore.ensureWritable(path)
    : path
}

async function writeFile(path: AbsPath, content: string): Promise<void> {
  await writeTextFile(await resolveWritablePath(path), content)
  gameManager.touchCurrentGameLastModified()
}

async function writeDocumentFile(path: AbsPath, content: Uint8Array): Promise<void> {
  const writablePath = await resolveWritablePath(path)
  const pendingWrite = registerPendingFileWrite(writablePath, content)

  try {
    await writeBinaryFile(writablePath, content)
  } catch (error) {
    rollbackPendingFileWrite(pendingWrite)
    throw error
  }

  commitPendingFileWrite(pendingWrite)
}

async function readDocumentFile(path: AbsPath): Promise<Uint8Array> {
  const fileStore = useFileStore()
  const readablePath = fileStore.isVfs
    ? await fileStore.resolveFilePath(path)
    : path
  return await readFile(readablePath)
}

function isPathWithinOrEqual(path: AbsPath, root: AbsPath): boolean {
  if (AbsPath.equals(path, root)) {
    return true
  }

  try {
    AbsPath.relativize(path, root)
    return true
  } catch {
    return false
  }
}

function resolvePreviewAssetPath(assetPath: string | undefined): AbsPath | undefined {
  const workspaceStore = useWorkspaceStore()
  const gamePath = workspaceStore.currentGame?.path
  if (!gamePath || !assetPath) {
    return undefined
  }

  return AbsPath.join(gamePath, RelPath.from(assetPath))
}

function doesChangedPathAffectAsset(
  changedPath: AbsPath,
  assetPath: AbsPath,
  includeChildren: boolean,
): boolean {
  return includeChildren
    ? isPathWithinOrEqual(assetPath, changedPath)
    : AbsPath.equals(changedPath, assetPath)
}

function resolvePreviewInvalidation(changedPath: AbsPath, includeChildren = false): GamePreviewInvalidation | undefined {
  const workspaceStore = useWorkspaceStore()
  const previewAssets = workspaceStore.currentGame?.previewAssets
  if (!previewAssets) {
    return undefined
  }

  const iconPath = resolvePreviewAssetPath(previewAssets.icon.path)
  const coverPath = resolvePreviewAssetPath(previewAssets.cover.path)
  const affectsIcon = !!iconPath && doesChangedPathAffectAsset(changedPath, iconPath, includeChildren)
  const affectsCover = !!coverPath && doesChangedPathAffectAsset(changedPath, coverPath, includeChildren)

  if (affectsIcon && affectsCover) {
    return 'all'
  }

  if (affectsIcon) {
    return 'icon'
  }

  return affectsCover ? 'cover' : undefined
}

function markPathChanged(path: AbsPath, options: { includeChildren?: boolean } = {}): void {
  const invalidation = resolvePreviewInvalidation(path, options.includeChildren)
  if (invalidation) {
    gameManager.refreshCurrentGamePreviewAssets({ invalidate: invalidation })
    return
  }

  gameManager.touchCurrentGameLastModified()
}

function assertMutableSceneEntry(path: AbsPath): void {
  const gamePath = useWorkspaceStore().currentGame?.path
  if (gamePath && isSceneEntryPath(path, gameSceneDir(gamePath))) {
    throw new AppError('PATH_OPERATION', '场景入口文件受保护，不能移动、重命名或删除', {
      details: { path },
    })
  }
}

function usesTemplateOverlayPath(path: AbsPath): boolean {
  const workspaceStore = useWorkspaceStore()
  const projectPath = workspaceStore.currentGame?.path
  if (!projectPath) {
    return false
  }

  const templateRoot = AbsPath.join(projectPath, RelPath.from('game/template'))
  return isPathWithinOrEqual(path, templateRoot)
}

interface TemplateOverlayPathContext {
  projectPath: AbsPath
  enginePath: AbsPath
  templatePath?: AbsPath
}

function toProjectRelative(projectPath: AbsPath, path: AbsPath): RelPath | undefined {
  if (AbsPath.equals(path, projectPath)) {
    return RelPath.empty()
  }

  try {
    return AbsPath.relativize(path, projectPath)
  } catch {
    return undefined
  }
}

async function resolveTemplateOverlayPathContext(): Promise<TemplateOverlayPathContext> {
  const workspaceStore = useWorkspaceStore()
  const game = workspaceStore.currentGame
  if (!game) {
    throw new AppError('FS_ERROR', '当前项目模板覆盖层上下文不可用')
  }

  try {
    const site = await gameManager.resolvePreviewSite(game)
    const { enginePath } = site
    if (!enginePath) {
      throw new AppError('FS_ERROR', '当前项目未绑定可用引擎，无法执行模板覆盖层路径操作')
    }

    return {
      projectPath: game.path,
      enginePath,
      templatePath: site.templatePath,
    }
  } catch {
    const enginePath = await gameManager.getGameEnginePath(game)
    if (!enginePath) {
      throw new AppError('FS_ERROR', '当前项目未绑定可用引擎，无法执行模板覆盖层路径操作')
    }

    return {
      projectPath: game.path,
      enginePath,
      templatePath: undefined,
    }
  }
}

function createTemplateOverlayResult(projectPath: AbsPath, relPath: RelPath): PathMutationResult {
  return {
    echoMode: 'synthetic',
    newPath: AbsPath.join(projectPath, relPath),
  }
}

async function renameNativePath(oldPath: AbsPath, newName: string): Promise<PathMutationResult> {
  return {
    echoMode: 'watcher',
    newPath: await fsCmds.renameFile(oldPath, newName),
  }
}

async function moveNativePath(sourcePath: AbsPath, targetDirectory: AbsPath, targetName?: string): Promise<PathMutationResult> {
  return {
    echoMode: 'watcher',
    newPath: targetName
      ? await fsCmds.moveFile(sourcePath, targetDirectory, targetName)
      : await fsCmds.moveFile(sourcePath, targetDirectory),
  }
}

async function renameTemplateOverlayPath(oldPath: AbsPath, newName: string): Promise<PathMutationResult> {
  const context = await resolveTemplateOverlayPathContext()
  const relPath = toProjectRelative(context.projectPath, oldPath)
  if (!relPath || RelPath.equals(relPath, RelPath.empty())) {
    throw new AppError('FS_ERROR', '不能重命名项目根目录')
  }

  const nextRelPath = await vfsCmds.renamePath({
    projectPath: context.projectPath,
    enginePath: context.enginePath,
    templatePath: context.templatePath,
    relPath,
    newName,
  })

  return createTemplateOverlayResult(context.projectPath, nextRelPath)
}

async function moveTemplateOverlayPath(
  sourcePath: AbsPath,
  targetDirectory: AbsPath,
  targetName?: string,
): Promise<PathMutationResult> {
  const context = await resolveTemplateOverlayPathContext()
  const relPath = toProjectRelative(context.projectPath, sourcePath)
  const relTargetDirectory = toProjectRelative(context.projectPath, targetDirectory)
  if (!relPath || !relTargetDirectory || RelPath.equals(relPath, RelPath.empty())) {
    throw new AppError('FS_ERROR', '不能移动项目根目录')
  }

  const targetRelPath = RelPath.append(relTargetDirectory, targetName ?? AbsPath.basename(sourcePath))
  const movedRelPath = await vfsCmds.movePath({
    projectPath: context.projectPath,
    enginePath: context.enginePath,
    templatePath: context.templatePath,
    relPath,
    targetRelPath,
  })

  return createTemplateOverlayResult(context.projectPath, movedRelPath)
}

async function renameFile(oldPath: AbsPath, newName: string): Promise<PathMutationResult> {
  assertMutableSceneEntry(oldPath)
  if (usesTemplateOverlayPath(oldPath)) {
    return renameTemplateOverlayPath(oldPath, newName)
  }

  return renameNativePath(oldPath, newName)
}

async function deleteFile(path: AbsPath, permanent?: boolean): Promise<void> {
  assertMutableSceneEntry(path)
  const fileStore = useFileStore()
  if (fileStore.isVfs && await fileStore.deleteEntry(path)) {
    markPathChanged(path, { includeChildren: true })
    return
  }

  await fsCmds.deleteFile(path, permanent)
  markPathChanged(path, { includeChildren: true })
}

async function resolveVfsCreatePath(
  targetPath: AbsPath,
  entryName: string,
  isDir: boolean,
): Promise<AbsPath> {
  const fileStore = useFileStore()
  const existingItems = await fileStore.getFolderContents(targetPath)
  const uniqueName = buildUniqueEntryName(
    entryName,
    isDir,
    new Set(existingItems.map(item => item.name)),
  )
  return fileStore.ensureWritable(AbsPath.append(targetPath, uniqueName))
}

async function createFile(targetPath: AbsPath, fileName: string): Promise<AbsPath> {
  const fileStore = useFileStore()
  if (!fileStore.isVfs) {
    const result = await fsCmds.createFile(targetPath, fileName)
    markPathChanged(result)
    return result
  }

  const writablePath = await resolveVfsCreatePath(targetPath, fileName, false)
  await writeTextFile(writablePath, '')
  markPathChanged(writablePath)
  return writablePath
}

async function createFolder(targetPath: AbsPath, folderName: string): Promise<AbsPath> {
  const fileStore = useFileStore()
  if (!fileStore.isVfs) {
    const result = await fsCmds.createFolder(targetPath, folderName)
    gameManager.touchCurrentGameLastModified()
    return result
  }

  const writablePath = await resolveVfsCreatePath(targetPath, folderName, true)
  await mkdir(writablePath, { recursive: true })
  gameManager.touchCurrentGameLastModified()
  return writablePath
}

async function copyFile(sourcePath: AbsPath, targetPath: AbsPath): Promise<AbsPath> {
  const fileStore = useFileStore()
  const finishUpdateBlocker = useRuntimeTaskStore()
    .beginBlockingTask(`copy-file:${crypto.randomUUID()}`)

  try {
    if (fileStore.isVfs) {
      const copiedPath = await fileStore.copyEntry(sourcePath, targetPath)
      if (copiedPath) {
        markPathChanged(copiedPath)
        return copiedPath
      }
    }

    const resolvedSourcePath = fileStore.isVfs
      ? await fileStore.resolveFilePath(sourcePath)
      : sourcePath
    const writableTargetPath = await resolveWritablePath(targetPath)
    const result = await fsCmds.copyFile(resolvedSourcePath, writableTargetPath)
    markPathChanged(result)
    return result
  } finally {
    finishUpdateBlocker()
  }
}

async function moveFile(sourcePath: AbsPath, targetPath: AbsPath, targetName?: string): Promise<PathMutationResult> {
  assertMutableSceneEntry(sourcePath)
  if (usesTemplateOverlayPath(sourcePath) || usesTemplateOverlayPath(targetPath)) {
    return moveTemplateOverlayPath(sourcePath, targetPath, targetName)
  }

  return moveNativePath(sourcePath, targetPath, targetName)
}

export const gameFs = {
  writeFile,
  writeDocumentFile,
  readDocumentFile,
  renameFile,
  deleteFile,
  createFile,
  createFolder,
  copyFile,
  moveFile,
}
