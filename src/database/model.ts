import type { EngineMetadata, EnginePreviewAssets, GameMetadata, GamePreviewAssets, TemplateMetadata } from '~/services/types'

export interface Game {
  id: string
  path: string
  engineId?: string
  createdAt: number
  lastModified: number
  status: GameStatus
  metadata: GameMetadata
  previewAssets: GamePreviewAssets
}

export interface Engine {
  id: string
  path: string
  engineId: string
  name: string
  version?: string
  createdAt: number
  status: EngineStatus
  metadata: EngineMetadata
  previewAssets: EnginePreviewAssets
}

export interface Template {
  id: string
  path: string
  createdAt: number
  status: TemplateStatus
  metadata: TemplateMetadata
}

export type GameStatus = 'created' | 'creating' | 'error'

export type EngineStatus = 'created' | 'creating' | 'error' | 'unavailable'

export type TemplateStatus = 'created' | 'creating' | 'error'
