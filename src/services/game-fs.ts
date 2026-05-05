import { join } from '@tauri-apps/api/path'
import { mkdir, writeFile as writeBinaryFile, writeTextFile } from '@tauri-apps/plugin-fs'

import { fsCmds } from '~/commands/fs'
import { registerPendingFileWrite, rollbackPendingFileWrite } from '~/services/file-write-echo-registry'
import { gameManager } from '~/services/game-manager'
import { useFileStore } from '~/stores/file'
import { buildUniqueEntryName } from '~/utils/path'

async function resolveWritablePath(path: string): Promise<string> {
  const fileStore = useFileStore()
  return fileStore.isVfs
    ? fileStore.ensureWritable(path)
    : path
}

async function writeFile(path: string, content: string): Promise<void> {
  await writeTextFile(await resolveWritablePath(path), content)
  gameManager.updateCurrentGameLastModified()
}

async function writeDocumentFile(path: string, content: Uint8Array): Promise<void> {
  const writablePath = await resolveWritablePath(path)
  const pendingWrite = registerPendingFileWrite(writablePath, content)

  try {
    await writeBinaryFile(writablePath, content)
  } catch (error) {
    rollbackPendingFileWrite(pendingWrite)
    throw error
  }

  gameManager.updateCurrentGameLastModified()
}

async function renameFile(oldPath: string, newName: string): Promise<string> {
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

async function deleteFile(path: string, permanent?: boolean): Promise<void> {
  const fileStore = useFileStore()
  if (fileStore.isVfs && await fileStore.deleteEntry(path)) {
    gameManager.updateCurrentGameLastModified()
    return
  }

  await fsCmds.deleteFile(path, permanent)
  gameManager.updateCurrentGameLastModified()
}

async function resolveVfsCreatePath(
  targetPath: string,
  entryName: string,
  isDir: boolean,
): Promise<string> {
  const fileStore = useFileStore()
  const existingItems = await fileStore.getFolderContents(targetPath)
  const uniqueName = buildUniqueEntryName(
    entryName,
    isDir,
    new Set(existingItems.map(item => item.name)),
  )
  return fileStore.ensureWritable(await join(targetPath, uniqueName))
}

async function createFile(targetPath: string, fileName: string): Promise<string> {
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

async function createFolder(targetPath: string, folderName: string): Promise<string> {
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

async function copyFile(sourcePath: string, targetPath: string): Promise<string> {
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

async function moveFile(sourcePath: string, targetPath: string): Promise<string> {
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
