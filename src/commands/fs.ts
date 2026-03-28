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

import { AppError } from '~/types/errors'
import { safeInvoke } from '~/utils/invoke'

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

async function copyDirectory(source: string, destination: string): Promise<void> {
  return safeInvoke<void>('copy_directory', { source, destination })
}

/**
 * 带进度条的递归复制目录
 */
async function copyDirectoryWithProgress(
  source: string,
  destination: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  const channel = new Channel<CopyEvent>()
  let channelError: AppError | undefined

  channel.onmessage = (data: CopyEvent) => {
    switch (data.event) {
      case 'progress': {
        onProgress(data.data.progress)
        break
      }
      case 'error': {
        channelError = new AppError('IO_ERROR', data.data.error)
        break
      }
      default: {
        break
      }
    }
  }

  try {
    await invoke('copy_directory_with_progress', {
      source,
      destination,
      onEvent: channel,
    })
  } catch (error) {
    throw AppError.fromInvoke('copy_directory_with_progress', error)
  }

  if (channelError) {
    throw channelError
  }
}

async function validateDirectoryStructure(
  path: string,
  requiredDirs: string[],
  requiredFiles: string[],
): Promise<boolean> {
  return safeInvoke<boolean>('validate_directory_structure', {
    path,
    requiredDirs,
    requiredFiles,
  })
}

/** 生成唯一的文件名 */
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

async function createFile(targetPath: string, fileName: string): Promise<string> {
  const uniqueName = await generateUniqueFileName(targetPath, fileName, false)
  const filePath = await join(targetPath, uniqueName)
  await writeTextFile(filePath, '')
  return filePath
}

async function createFolder(targetPath: string, folderName: string): Promise<string> {
  const uniqueName = await generateUniqueFileName(targetPath, folderName, true)
  const folderPath = await join(targetPath, uniqueName)
  await mkdir(folderPath, { recursive: true })
  return folderPath
}

async function deleteFile(path: string, permanent = false): Promise<void> {
  return safeInvoke<void>('delete_file', { path, permanent })
}

async function renameFile(oldPath: string, newName: string): Promise<string> {
  const parentDir = await dirname(oldPath)
  const newPath = await join(parentDir, newName)

  if (await exists(newPath)) {
    throw new AppError('IO_ERROR', '目标路径已存在')
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

async function copyFile(sourcePath: string, targetPath: string): Promise<string> {
  const { destPath, isDir } = await getDestinationPath(sourcePath, targetPath)
  await (isDir ? copyDirectory(sourcePath, destPath) : copyFileFs(sourcePath, destPath))
  return destPath
}

async function moveFile(sourcePath: string, targetPath: string): Promise<string> {
  const { destPath } = await getDestinationPath(sourcePath, targetPath)
  await rename(sourcePath, destPath)
  return destPath
}

async function isBinaryFile(path: string): Promise<boolean> {
  return safeInvoke<boolean>('is_binary_file', { path })
}

/** 仅读取文件头部元数据获取图片分辨率，不解码完整图片 */
async function getImageDimensions(path: string): Promise<[number, number]> {
  return safeInvoke<[number, number]>('get_image_dimensions', { path })
}

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
  isBinaryFile,
  getImageDimensions,
}
