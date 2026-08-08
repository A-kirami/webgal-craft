import type { VfsSource } from './project-config'

export type FileViewerSortBy = 'name' | 'modifiedTime' | 'createdTime' | 'size'
export type FileViewerSortOrder = 'asc' | 'desc'

export interface FileViewerItem {
  name: string
  path: string
  isDir: boolean
  mimeType?: string
  isSupported?: boolean
  referenceCount?: number
  size?: number
  modifiedAt?: number
  createdAt?: number
  source?: VfsSource
}

export interface FileViewerPreviewSize {
  width: number
  height: number
}

export interface FileViewerVirtualRow {
  key: string | number | bigint
  index: number
  size: number
  start: number
}
