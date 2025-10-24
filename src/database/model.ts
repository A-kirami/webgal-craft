export interface Game {
  id: string
  path: string
  createdAt: number
  lastModified: number
  status: Status
  metadata: GameMetadata
}

export interface Engine {
  id: string
  path: string
  createdAt: number
  status: Status
  metadata: EngineMetadata
}

export type Status = 'created' | 'creating' | 'error'
