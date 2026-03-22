import { invoke } from '@tauri-apps/api/core'

import { AppError } from '~/types/errors'
import { safeInvoke } from '~/utils/invoke'

export type ThumbnailSize = number | {
  width: number
  height: number
}

/**
 * 获取图片缩略图
 */
async function getThumbnail(path: string, size?: ThumbnailSize): Promise<string> {
  try {
    const data = await invoke<Uint8Array<ArrayBuffer>>('get_thumbnail', { path, size })
    const blob = new Blob([data], { type: 'image/webp' })
    return URL.createObjectURL(blob)
  } catch (error) {
    throw AppError.fromInvoke('get_thumbnail', error)
  }
}

async function clearThumbnailCache() {
  return safeInvoke<void>('clear_thumbnail_cache')
}

/** 仅读取文件头部元数据获取图片分辨率，不解码完整图片 */
async function getImageDimensions(path: string): Promise<[number, number]> {
  return safeInvoke<[number, number]>('get_image_dimensions', { path })
}

export const thumbnailCmds = {
  getThumbnail,
  getImageDimensions,
  clearThumbnailCache,
}
