import { Channel, invoke } from '@tauri-apps/api/core'
import { basename, dirname, join } from '@tauri-apps/api/path'
import {
  copyFile as copyFileFs,
  exists,
  mkdir,
  rename,
  stat,
  writeTextFile,
} from '@tauri-apps/plugin-fs'

/**
 * 复制事件类型
 */
type CopyEvent = {
  event: 'progress'
  data: {
    progress: number
    copiedFiles: number
    totalFiles: number
  }
} | {
  event: 'error'
  data: {
    error: string
  }
}

/**
 * 递归复制目录
 * @param source 源目录路径
 * @param destination 目标目录路径
 * @returns Promise<void>
 * @throws 当复制过程中发生错误时抛出异常
 */
async function copyDirectory(source: string, destination: string): Promise<void> {
  try {
    await invoke('copy_directory', {
      source,
      destination,
    })
  } catch (error) {
    throw new Error(`复制目录失败: ${error}`)
  }
}

/**
 * 带进度条的递归复制目录
 * @param source 源目录路径
 * @param destination 目标目录路径
 * @param onProgress 进度回调函数，接收进度百分比(0-100)
 * @returns Promise<void>
 * @throws 当复制过程中发生错误时抛出异常
 */
async function copyDirectoryWithProgress(
  source: string,
  destination: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  try {
    // 创建进度通道
    const channel = new Channel<CopyEvent>()

    // 监听进度更新
    const messageHandler = (data: CopyEvent) => {
      switch (data.event) {
        case 'progress': {
          onProgress(data.data.progress)
          break
        }
        case 'error': {
          throw new Error(data.data.error)
        }
        default: {
          break
        }
      }
    }

    channel.onmessage = messageHandler

    // 开始复制
    await invoke('copy_directory_with_progress', {
      source,
      destination,
      onEvent: channel,
    })
  } catch (error) {
    throw new Error(`复制目录失败: ${error}`)
  }
}

/**
 * 验证目录结构
 * @param path 要验证的目录路径
 * @param requiredDirs 必需的文件夹列表
 * @param requiredFiles 必需的文件列表
 * @returns Promise<boolean> 如果目录结构符合要求返回 true，否则返回 false
 * @throws 当验证过程中发生错误时抛出异常
 */
async function validateDirectoryStructure(
  path: string,
  requiredDirs: string[],
  requiredFiles: string[],
): Promise<boolean> {
  try {
    return await invoke('validate_directory_structure', {
      path,
      requiredDirs,
      requiredFiles,
    })
  } catch (error) {
    throw new Error(`验证目录结构失败: ${error}`)
  }
}

/**
 * 生成唯一的文件名
 * @param parentPath 父目录路径
 * @param baseName 基础文件名
 * @param isDir 是否为目录
 * @returns Promise<string> 唯一的文件名
 */
async function generateUniqueFileName(parentPath: string, baseName: string, isDir: boolean): Promise<string> {
  let counter = 1
  let newName = baseName
  let newPath = await join(parentPath, newName)

  // 提取文件扩展名和基础名称（避免在循环中重复计算）
  const lastDotIndex = baseName.lastIndexOf('.')
  const ext = isDir || lastDotIndex === -1 ? '' : baseName.slice(lastDotIndex)
  const nameWithoutExt = isDir || lastDotIndex === -1 ? baseName : baseName.slice(0, lastDotIndex)

  // eslint-disable-next-line no-await-in-loop
  while (await exists(newPath)) {
    newName = `${nameWithoutExt} (${counter})${ext}`
    // eslint-disable-next-line no-await-in-loop
    newPath = await join(parentPath, newName)
    counter++
  }

  return newName
}

/**
 * 创建新文件
 * @param targetPath 目标目录路径
 * @param fileName 文件名（可选，默认：新文件.txt）
 * @returns Promise<string> 创建的文件完整路径
 * @throws 当创建失败时抛出异常
 */
async function createFile(targetPath: string, fileName = '新文件.txt'): Promise<string> {
  const uniqueName = await generateUniqueFileName(targetPath, fileName, false)
  const filePath = await join(targetPath, uniqueName)
  await writeTextFile(filePath, '')
  return filePath
}

/**
 * 创建新文件夹
 * @param targetPath 目标目录路径
 * @param folderName 文件夹名（可选，默认：新文件夹）
 * @returns Promise<string> 创建的文件夹完整路径
 * @throws 当创建失败时抛出异常
 */
async function createFolder(targetPath: string, folderName = '新文件夹'): Promise<string> {
  const uniqueName = await generateUniqueFileName(targetPath, folderName, true)
  const folderPath = await join(targetPath, uniqueName)
  await mkdir(folderPath, { recursive: true })
  return folderPath
}

/**
 * 删除文件或文件夹
 * @param path 要删除的路径
 * @param permanent 是否永久删除（默认 false，移动到回收站）
 * @returns Promise<void>
 * @throws 当删除失败时抛出异常
 */
async function deleteFile(path: string, permanent = false): Promise<void> {
  try {
    await invoke('delete_file', {
      path,
      permanent,
    })
  } catch (error) {
    throw new Error(`删除文件失败: ${error}`)
  }
}

/**
 * 重命名文件或文件夹
 * @param oldPath 旧路径
 * @param newName 新名称
 * @returns Promise<string> 新路径
 * @throws 当重命名失败时抛出异常
 */
async function renameFile(oldPath: string, newName: string): Promise<string> {
  const parentDir = await dirname(oldPath)
  const newPath = await join(parentDir, newName)

  if (await exists(newPath)) {
    throw new Error('目标路径已存在')
  }

  await rename(oldPath, newPath)
  return newPath
}

interface DestinationPath {
  destPath: string
  isDir: boolean
}

/**
 * 获取目标路径（用于复制和移动操作）
 */
async function getDestinationPath(sourcePath: string, targetPath: string): Promise<DestinationPath> {
  const sourceName = await basename(sourcePath)
  const sourceStat = await stat(sourcePath)
  const isDir = sourceStat.isDirectory
  const uniqueName = await generateUniqueFileName(targetPath, sourceName, isDir)
  const destPath = await join(targetPath, uniqueName)
  return { destPath, isDir }
}

/**
 * 复制文件或文件夹
 * @param sourcePath 源路径
 * @param targetPath 目标目录路径
 * @returns Promise<string> 新文件/文件夹的完整路径
 * @throws 当复制失败时抛出异常
 */
async function copyFile(sourcePath: string, targetPath: string): Promise<string> {
  const { destPath, isDir } = await getDestinationPath(sourcePath, targetPath)
  await (isDir ? copyDirectory(sourcePath, destPath) : copyFileFs(sourcePath, destPath))
  return destPath
}

/**
 * 移动（剪切）文件或文件夹
 * @param sourcePath 源路径
 * @param targetPath 目标目录路径
 * @returns Promise<string> 新文件/文件夹的完整路径
 * @throws 当移动失败时抛出异常
 */
async function moveFile(sourcePath: string, targetPath: string): Promise<string> {
  const { destPath } = await getDestinationPath(sourcePath, targetPath)
  await rename(sourcePath, destPath)
  return destPath
}

/**
 * 文件系统命令对象，提供文件系统操作功能
 */
export const fsCmds = {
  copyDirectory,
  copyDirectoryWithProgress,
  validateDirectoryStructure,
  generateUniqueFileName,
  createFile,
  createFolder,
  deleteFile,
  renameFile,
  copyFile,
  moveFile,
}
