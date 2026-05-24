import { groupEngines } from '~/composables/use-engine-groups'
import { toEngineCollectionItem } from '~/features/home/home-collection-items'
import { isEngineUsable } from '~/services/engine-manager'

import type { Engine } from '~/database/model'
import type { AbsPath } from '~/domain/path'
import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'

export interface BuildEngineGroupCollectionItemsOptions {
  defaultEngineId?: string
  engines: readonly Engine[]
  resolveServeUrl: (path: AbsPath) => string | undefined
}

export function buildEngineGroupCollectionItems(
  options: BuildEngineGroupCollectionItemsOptions,
): EngineGroupCollectionItem[] {
  return groupEngines(options.engines).map((group) => {
    const items = group.engines.map(engine => toEngineCollectionItem(engine, options.resolveServeUrl))
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
      isUnavailable: latestDisplayable === undefined,
      isDefault: group.engineId === options.defaultEngineId,
      latestVersionLabel: latestAvailable?.engine.version,
      representativeItem: latestAvailable ?? latestDisplayable,
      summary: representative?.engine.metadata.description ?? '',
      unavailableCount: items.filter(item => item.engine.availability !== 'available').length,
      versionCount: items.length,
    }
  })
}
