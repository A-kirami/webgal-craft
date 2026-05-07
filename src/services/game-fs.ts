import { mkdir, writeFile as writeBinaryFile, writeTextFile } from '@tauri-apps/plugin-fs'

import { fsCmds } from '~/commands/fs'
import { AbsPath } from '~/domain/path'
import {
  commitPendingFileWrite,
  registerPendingFileWrite,
  rollbackPendingFileWrite,
} from '~/services/file-write-echo-registry'
import { gameManager } from '~/services/game-manager'
import { useFileStore } from '~/stores/file'
import { buildUniqueEntryName } from '~/utils/entry-name'

async function resolveWritablePath(path: AbsPath): Promise<AbsPath> {
  const fileStore = useFileStore()
  return fileStore.isVfs
    ? fileStore.ensureWritable(path)
    : path
}

async function writeFile(path: AbsPath, content: string): Promise<void> {
  await writeTextFile(await resolveWritablePath(path), content)
  gameManager.updateCurrentGameLastModified()
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
  gameManager.updateCurrentGameLastModified()
}

async function renameFile(oldPath: AbsPath, newName: string): Promise<AbsPath> {
  const fileStore = useFileStore()
  if (fileStore.isVfs) {
    const renamedPath = await fileStore.renameEntry(oldPath, newName)
    if (renamedPath) {
      gameManager.updateCurrentGameLastModified()
      return renamedPath
    }
  }

  const result = await fsCmds.renameFile(oldPath, newName)
  gameManager.updateCurrentGameLastModified()
  return result
}

async function deleteFile(path: AbsPath, permanent?: boolean): Promise<void> {
  const fileStore = useFileStore()
  if (fileStore.isVfs && await fileStore.deleteEntry(path)) {
    gameManager.updateCurrentGameLastModified()
    return
  }

  await fsCmds.deleteFile(path, permanent)
  gameManager.updateCurrentGameLastModified()
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
    gameManager.updateCurrentGameLastModified()
    return result
  }

  const writablePath = await resolveVfsCreatePath(targetPath, fileName, false)
  await writeTextFile(writablePath, '')
  gameManager.updateCurrentGameLastModified()
  return writablePath
}

async function createFolder(targetPath: AbsPath, folderName: string): Promise<AbsPath> {
  const fileStore = useFileStore()
  if (!fileStore.isVfs) {
    const result = await fsCmds.createFolder(targetPath, folderName)
    gameManager.updateCurrentGameLastModified()
    return result
  }

  const writablePath = await resolveVfsCreatePath(targetPath, folderName, true)
  await mkdir(writablePath, { recursive: true })
  gameManager.updateCurrentGameLastModified()
  return writablePath
}

async function copyFile(sourcePath: AbsPath, targetPath: AbsPath): Promise<AbsPath> {
  const fileStore = useFileStore()
  if (fileStore.isVfs) {
    const copiedPath = await fileStore.copyEntry(sourcePath, targetPath)
    if (copiedPath) {
      gameManager.updateCurrentGameLastModified()
      return copiedPath
    }
  }

  const resolvedSourcePath = fileStore.isVfs
    ? await fileStore.resolveFilePath(sourcePath)
    : sourcePath
  const result = await fsCmds.copyFile(resolvedSourcePath, targetPath)
  gameManager.updateCurrentGameLastModified()
  return result
}

async function moveFile(sourcePath: AbsPath, targetPath: AbsPath): Promise<AbsPath> {
  const fileStore = useFileStore()
  if (!fileStore.isVfs) {
    const result = await fsCmds.moveFile(sourcePath, targetPath)
    gameManager.updateCurrentGameLastModified()
    return result
  }

  const movedPath = await fileStore.moveEntry(sourcePath, targetPath)
  if (movedPath) {
    gameManager.updateCurrentGameLastModified()
    return movedPath
  }

  const resolvedSourcePath = await fileStore.resolveFilePath(sourcePath)
  const result = await fsCmds.copyFile(resolvedSourcePath, targetPath)
  await fileStore.deleteEntry(sourcePath)
  gameManager.updateCurrentGameLastModified()
  return result
}

export const gameFs = {
  writeFile,
  writeDocumentFile,
  renameFile,
  deleteFile,
  createFile,
  createFolder,
  copyFile,
  moveFile,
}
