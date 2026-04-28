import type { Engine, Game } from '~/database/model'
import type { TemplateGroupViewModel } from '~/features/home/templates-tab/template-groups'

export interface GameCollectionItem {
  game: Game
  rootPath: string
  serveUrl?: string
}

export interface EngineCollectionItem {
  engine: Engine
  serveUrl?: string
}

export function toEngineCollectionItem(
  engine: Engine,
  resolveServeUrl: (path: string) => string | undefined,
): EngineCollectionItem {
  return {
    engine,
    serveUrl: resolveServeUrl(engine.path),
  }
}

export interface EngineGroupCollectionItem {
  engineId: string
  engines: EngineCollectionItem[]
  hasAvailableVersion: boolean
  isDefault: boolean
  latestVersionLabel?: string
  name: string
  representativeItem?: EngineCollectionItem
  summary: string
  unavailableCount: number
  versionCount: number
}

export interface TemplateCollectionItem {
  representativeEngineItem?: EngineCollectionItem
  templateGroup: TemplateGroupViewModel
}
