import { invoke } from '@tauri-apps/api/core'

/**
 * 缩略图尺寸类型
 */
export type ThumbnailSize = number | {
  width: number
  height: number
}

/**
 * 获取图片缩略图
 *
 * @param path - 图片文件路径
 * @param size - 可选的缩略图尺寸，可以是单个数字（表示宽高相同）或包含 width 和 height 的对象
 * @returns 缩略图的 blob URL
 * @throws 当图片处理失败时抛出错误
 */
async function getThumbnail(path: string, size?: ThumbnailSize): Promise<string> {
  try {
    const data = await invoke<Uint8Array<ArrayBuffer>>('get_thumbnail', { path, size })

    // 将二进制数据转换为 Blob
    const blob = new Blob([data], { type: 'image/webp' })

    // 创建并返回 blob URL
    return URL.createObjectURL(blob)
  } catch (error) {
    throw new Error(`Failed to generate thumbnail: ${error}`)
  }
}

/**
 * 清理缩略图缓存
 *
 * @returns 无返回值
 * @throws 当清理缓存失败时抛出错误
 */
async function clearThumbnailCache() {
  try {
    await invoke<void>('clear_thumbnail_cache')
  } catch (error) {
    throw new Error(`Failed to clear thumbnail cache: ${error}`)
  }
}

/**
 * 缩略图命令对象，提供与后端通信的缩略图相关命令调用功能
 */
export const thumbnailCmds = {
  getThumbnail,
  clearThumbnailCache,
}
