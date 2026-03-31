import { fsCmds } from '~/commands/fs'

import type { FileViewerItem } from '~/types/file-viewer'

export interface FileViewerImageDimensions {
  width: number
  height: number
}

const imageDimensionsCache = new Map<string, FileViewerImageDimensions>()
const pendingImageDimensionRequests = new Map<string, Promise<FileViewerImageDimensions | undefined>>()

export function getFileViewerImageDimensionsCacheKey(item: Pick<FileViewerItem, 'path' | 'modifiedAt'>): string {
  return `${item.path}:${item.modifiedAt ?? 'unknown'}`
}

export async function loadFileViewerImageDimensions(
  item: Pick<FileViewerItem, 'path' | 'modifiedAt' | 'mimeType'>,
): Promise<FileViewerImageDimensions | undefined> {
  if (item.mimeType === 'image/svg+xml' || item.path.toLowerCase().endsWith('.svg')) {
    return undefined
  }

  const cacheKey = getFileViewerImageDimensionsCacheKey(item)
  const cachedDimensions = imageDimensionsCache.get(cacheKey)
  if (cachedDimensions) {
    return cachedDimensions
  }

  const pendingRequest = pendingImageDimensionRequests.get(cacheKey)
  if (pendingRequest) {
    return pendingRequest
  }

  const request = (async () => {
    try {
      const [width, height] = await fsCmds.getImageDimensions(item.path)
      const dimensions = {
        width,
        height,
      }
      imageDimensionsCache.set(cacheKey, dimensions)
      return dimensions
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      void logger.error(`[FileViewer] 读取图片尺寸失败: ${item.path} - ${errorMessage}`)
    } finally {
      pendingImageDimensionRequests.delete(cacheKey)
    }
  })()

  pendingImageDimensionRequests.set(cacheKey, request)
  return request
}
