import type { Engine, Game } from '~/database/model'

export interface GameCollectionItem {
  game: Game
  serveUrl?: string
}

export interface EngineCollectionItem {
  engine: Engine
  serveUrl?: string
}
