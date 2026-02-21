export interface FileViewerItem {
  name: string
  path: string
  isDir: boolean
  mimeType?: string
  isSupported?: boolean
  modifiedAt?: number
}
