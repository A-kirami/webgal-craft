import { Channel, invoke } from '@tauri-apps/api/core'

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
 * 文件系统命令对象，提供与后端通信的文件系统操作功能
 */
export const fsCmds = {
  copyDirectory,
  copyDirectoryWithProgress,
  validateDirectoryStructure,
}
