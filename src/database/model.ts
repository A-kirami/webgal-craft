import { EngineMetadata, EnginePreviewAssets, GameMetadata, GamePreviewAssets } from '~/services/types'

export interface Game {
  id: string
  path: string
  createdAt: number
  lastModified: number
  status: Status
  metadata: GameMetadata
  previewAssets: GamePreviewAssets
}

export interface Engine {
  id: string
  path: string
  createdAt: number
  status: Status
  metadata: EngineMetadata
  previewAssets: EnginePreviewAssets
}

export type Status = 'created' | 'creating' | 'error'
