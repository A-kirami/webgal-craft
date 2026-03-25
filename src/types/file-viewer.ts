export type FileViewerSortBy = 'name' | 'modifiedTime' | 'createdTime' | 'size'
export type FileViewerSortOrder = 'asc' | 'desc'

export interface FileViewerItem {
  name: string
  path: string
  isDir: boolean
  mimeType?: string
  isSupported?: boolean
  size?: number
  modifiedAt?: number
  createdAt?: number
}

export interface FileViewerVirtualRow {
  key: string | number | bigint
  index: number
  size: number
  start: number
}
