import { Channel, invoke } from '@tauri-apps/api/core'
import {
  copyFile as copyFileFs,
  exists,
  mkdir,
  rename,
  stat,
  writeTextFile,
} from '@tauri-apps/plugin-fs'

import { AbsPath } from '~/domain/path'
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

async function copyDirectory(source: AbsPath, destination: AbsPath): Promise<void> {
  return safeInvoke<void>('copy_directory', { source, destination })
}

/**
 * 带进度条的递归复制目录
 *
 * `overwrite` 默认 false：使用 create_new 语义，保留目标已有文件；
 * 安装/创建等需要刷新内容的流程应显式传 true，避免上次失败残留与新内容混杂。
 */
async function copyDirectoryWithProgress(
  source: AbsPath,
  destination: AbsPath,
  onProgress: (progress: number) => void,
  options?: { excludes?: string[], overwrite?: boolean },
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
      excludes: options?.excludes,
      overwrite: options?.overwrite,
    })
  } catch (error) {
    throw AppError.fromInvoke('copy_directory_with_progress', error)
  }

  if (channelError) {
    throw channelError
  }
}

async function validateDirectoryStructure(
  path: AbsPath,
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
async function generateUniqueFileName(parentPath: AbsPath, baseName: string, isDir: boolean): Promise<string> {
  let counter = 1
  let newName = baseName
  let newPath = AbsPath.append(parentPath, newName)

  // 提取文件扩展名和基础名称（避免在循环中重复计算）
  const lastDotIndex = baseName.lastIndexOf('.')
  const ext = isDir || lastDotIndex === -1 ? '' : baseName.slice(lastDotIndex)
  const nameWithoutExt = isDir || lastDotIndex === -1 ? baseName : baseName.slice(0, lastDotIndex)

  // 必须串行检查，直到找到未占用名称为止。
  // eslint-disable-next-line no-await-in-loop
  while (await exists(newPath)) {
    newName = `${nameWithoutExt} (${counter})${ext}`
    newPath = AbsPath.append(parentPath, newName)
    counter++
  }

  return newName
}

async function createFile(targetPath: AbsPath, fileName: string): Promise<AbsPath> {
  const uniqueName = await generateUniqueFileName(targetPath, fileName, false)
  const filePath = AbsPath.append(targetPath, uniqueName)
  await writeTextFile(filePath, '')
  return filePath
}

async function createFolder(targetPath: AbsPath, folderName: string): Promise<AbsPath> {
  const uniqueName = await generateUniqueFileName(targetPath, folderName, true)
  const folderPath = AbsPath.append(targetPath, uniqueName)
  await mkdir(folderPath, { recursive: true })
  return folderPath
}

async function deleteFile(path: AbsPath, permanent = false): Promise<void> {
  return safeInvoke<void>('delete_file', { path, permanent })
}

async function renameFile(oldPath: AbsPath, newName: string): Promise<AbsPath> {
  return AbsPath.from(await safeInvoke<string>('rename_file', { path: oldPath, newName }))
}

interface DestinationPath {
  destPath: AbsPath
  isDir: boolean
}

/**
 * 获取目标路径（用于复制和移动操作）
 */
async function getDestinationPath(sourcePath: AbsPath, targetPath: AbsPath, targetName?: string): Promise<DestinationPath> {
  const sourceName = AbsPath.basename(sourcePath)
  const sourceStat = await stat(sourcePath)
  const isDir = sourceStat.isDirectory
  const uniqueName = targetName ?? await generateUniqueFileName(targetPath, sourceName, isDir)
  const destPath = AbsPath.append(targetPath, uniqueName)
  return { destPath, isDir }
}

async function copyFile(sourcePath: AbsPath, targetPath: AbsPath): Promise<AbsPath> {
  const { destPath, isDir } = await getDestinationPath(sourcePath, targetPath)
  await (isDir ? copyDirectory(sourcePath, destPath) : copyFileFs(sourcePath, destPath))
  return destPath
}

async function moveFile(sourcePath: AbsPath, targetPath: AbsPath, targetName?: string): Promise<AbsPath> {
  const { destPath } = await getDestinationPath(sourcePath, targetPath, targetName)
  await rename(sourcePath, destPath)
  return destPath
}

async function isBinaryFile(path: AbsPath): Promise<boolean> {
  return safeInvoke<boolean>('is_binary_file', { path })
}

/** 仅读取文件头部元数据获取图片分辨率，不解码完整图片 */
async function getImageDimensions(path: AbsPath): Promise<[number, number]> {
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
