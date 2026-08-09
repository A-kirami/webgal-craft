import { groupEngines } from '~/composables/use-engine-groups'
import { toEngineCollectionItem } from '~/features/home/home-collection-items'
import { isEngineUsable } from '~/services/engine-manager'

import type { EngineGroup } from '~/composables/use-engine-groups'
import type { Engine } from '~/database/model'
import type { AbsPath } from '~/domain/path'
import type { EngineGroupCollectionItem, EngineGroupRemoteState } from '~/features/home/home-collection-items'

export interface BuildEngineGroupCollectionItemsOptions {
  defaultEngineId?: string
  engines: readonly Engine[]
  remoteByEngineId?: ReadonlyMap<string, EngineGroupRemoteState>
  resolveServeUrl: (path: AbsPath) => string | undefined
}

interface EngineGroupBuildInput {
  defaultEngineId?: string
  group: EngineGroup
  remote?: EngineGroupRemoteState
  resolveServeUrl: (path: AbsPath) => string | undefined
}

export function buildEngineGroupCollectionItem(
  options: EngineGroupBuildInput,
): EngineGroupCollectionItem {
  const { defaultEngineId, group, remote, resolveServeUrl } = options
  const items = group.engines.map(engine => toEngineCollectionItem(engine, resolveServeUrl))
  const latestAvailable = items.find(item => isEngineUsable(item.engine))
  const latestDisplayable = items.find(({ engine }) => engine.availability === 'available' && engine.status !== 'error')
  const representative = latestAvailable ?? latestDisplayable ?? items[0]
  const isImporting = items.some(({ engine }) => engine.status === 'creating')

  return {
    engineId: group.engineId,
    name: group.name,
    engines: items,
    hasAvailableVersion: latestAvailable !== undefined,
    isImporting,
    isUnavailable: latestDisplayable === undefined
      && (remote?.releases.length ?? 0) === 0
      && remote?.status !== 'loading'
      && remote?.status !== 'installing',
    isDefault: group.engineId === defaultEngineId,
    latestVersionLabel: latestAvailable?.engine.version,
    representativeItem: latestAvailable ?? latestDisplayable,
    summary: representative?.engine.metadata.description ?? '',
    unavailableCount: items.filter(item => item.engine.availability !== 'available').length,
    versionCount: items.length,
    remote,
  }
}

export function buildEngineGroupCollectionItems(
  options: BuildEngineGroupCollectionItemsOptions,
): EngineGroupCollectionItem[] {
  return groupEngines(options.engines).map(group => buildEngineGroupCollectionItem({
    defaultEngineId: options.defaultEngineId,
    group,
    remote: options.remoteByEngineId?.get(group.engineId),
    resolveServeUrl: options.resolveServeUrl,
  }))
}

export function createEmptyEngineGroupCollectionItem(options: {
  defaultEngineId?: string
  engineId: string
  name: string
  remote?: EngineGroupRemoteState
}): EngineGroupCollectionItem {
  return buildEngineGroupCollectionItem({
    defaultEngineId: options.defaultEngineId,
    group: {
      engineId: options.engineId,
      engines: [],
      name: options.name,
    },
    remote: options.remote,
    resolveServeUrl: () => undefined,
  })
}
