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
  name: string // 从配置文件获取
}

export interface EngineMetadata {
  name: string // 从配置文件获取
  description: string // 从配置文件获取
}
