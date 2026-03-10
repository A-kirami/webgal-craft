import { invoke } from '@tauri-apps/api/core'

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

export const thumbnailCmds = {
  getThumbnail,
  clearThumbnailCache,
}
