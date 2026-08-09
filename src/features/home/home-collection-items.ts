import type { Engine, Game } from '~/database/model'
import type { OfficialEngineRelease } from '~/domain/engine/official-release'
import type { AbsPath } from '~/domain/path'
import type { TemplateGroupViewModel } from '~/features/home/templates-tab/template-groups'

export interface EngineGroupRemoteState {
  releases: readonly OfficialEngineRelease[]
  status: 'loading' | 'ready' | 'installing' | 'error'
}

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
  resolveServeUrl: (path: AbsPath) => string | undefined,
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
  isImporting: boolean
  isUnavailable: boolean
  isDefault: boolean
  latestVersionLabel?: string
  name: string
  representativeItem?: EngineCollectionItem
  summary: string
  unavailableCount: number
  versionCount: number
  remote?: EngineGroupRemoteState
}

export interface TemplateCollectionItem {
  representativeEngineItem?: EngineCollectionItem
  templateGroup: TemplateGroupViewModel
}
