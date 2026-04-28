export interface PreviewAsset {
  path: string
  cacheVersion?: number
}

export interface GamePreviewAssets {
  icon: PreviewAsset
  cover: PreviewAsset
}

export interface EnginePreviewAssets {
  icon: PreviewAsset
}

export interface GameMetadata {
  name: string
  titleImg?: string
}

export interface EngineMetadata {
  type?: 'official' | 'custom'
  webgalVersion?: string
  description: string
  icon: string
  descriptions?: Record<string, string>
  maintainer?: string
  license?: string
  urls?: Record<string, string>
  live2dSupport?: boolean
  spineSupport?: boolean
}

export interface TemplateMetadata {
  name: string
  webgalVersion?: string
}
