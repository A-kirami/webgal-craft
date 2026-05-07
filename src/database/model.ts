import type { ResourceAvailability } from '~/services/resource-health'
import type { EngineMetadata, EnginePreviewAssets, GameMetadata, GamePreviewAssets, TemplateMetadata } from '~/services/types'

export interface Game {
  id: string
  path: string
  pathLookupKey: string
  engineId?: string
  createdAt: number
  lastModified: number
  status: GameStatus
  availability: ResourceAvailability
  metadata: GameMetadata
  previewAssets: GamePreviewAssets
}

export interface Engine {
  id: string
  path: string
  pathLookupKey: string
  engineId: string
  name: string
  version?: string
  createdAt: number
  status: EngineStatus
  availability: ResourceAvailability
  metadata: EngineMetadata
  previewAssets: EnginePreviewAssets
}

export interface Template {
  id: string
  path: string
  createdAt: number
  status: TemplateStatus
  availability: ResourceAvailability
  metadata: TemplateMetadata
}

export type GameStatus = 'created' | 'creating' | 'error'

export type EngineStatus = 'created' | 'creating' | 'error'

export type TemplateStatus = 'created' | 'creating' | 'error'
