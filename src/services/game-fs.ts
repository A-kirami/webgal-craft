import { writeTextFile } from '@tauri-apps/plugin-fs'

/**
 * 游戏项目文件操作服务
 *
 * 封装对游戏项目文件的增删改操作，在操作成功后自动更新游戏的 lastModified 时间戳。
 * 底层文件操作委托给 fsCmds，时间戳更新委托给 gameManager（内部已防抖）。
 *
 * 新增涉及游戏项目的文件编辑操作时，请使用此服务而非直接调用 fsCmds / writeTextFile，
 * 以免遗漏 lastModified 更新。
 */

async function writeFile(path: string, content: string): Promise<void> {
  await writeTextFile(path, content)
  gameManager.updateCurrentGameLastModified()
}

async function renameFile(oldPath: string, newName: string): Promise<string> {
  const result = await fsCmds.renameFile(oldPath, newName)
  gameManager.updateCurrentGameLastModified()
  return result
}

async function deleteFile(path: string, permanent?: boolean): Promise<void> {
  await fsCmds.deleteFile(path, permanent)
  gameManager.updateCurrentGameLastModified()
}

async function createFile(targetPath: string, fileName: string): Promise<string> {
  const result = await fsCmds.createFile(targetPath, fileName)
  gameManager.updateCurrentGameLastModified()
  return result
}

async function createFolder(targetPath: string, folderName: string): Promise<string> {
  const result = await fsCmds.createFolder(targetPath, folderName)
  gameManager.updateCurrentGameLastModified()
  return result
}

async function copyFile(sourcePath: string, targetPath: string): Promise<string> {
  const result = await fsCmds.copyFile(sourcePath, targetPath)
  gameManager.updateCurrentGameLastModified()
  return result
}

async function moveFile(sourcePath: string, targetPath: string): Promise<string> {
  const result = await fsCmds.moveFile(sourcePath, targetPath)
  gameManager.updateCurrentGameLastModified()
  return result
}

export const gameFs = {
  writeFile,
  renameFile,
  deleteFile,
  createFile,
  createFolder,
  copyFile,
  moveFile,
}
