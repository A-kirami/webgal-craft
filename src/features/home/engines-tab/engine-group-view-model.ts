import { groupEngines } from '~/composables/use-engine-groups'
import { toEngineCollectionItem } from '~/features/home/home-collection-items'
import { isEngineUsable } from '~/services/engine-manager'

import type { Engine } from '~/database/model'
import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'

export interface BuildEngineGroupCollectionItemsOptions {
  defaultEngineId?: string
  engines: readonly Engine[]
  resolveServeUrl: (path: string) => string | undefined
}

export function buildEngineGroupCollectionItems(
  options: BuildEngineGroupCollectionItemsOptions,
): EngineGroupCollectionItem[] {
  return groupEngines(options.engines).map((group) => {
    const items = group.engines.map(engine => toEngineCollectionItem(engine, options.resolveServeUrl))
    const availableItems = items.filter(item => isEngineUsable(item.engine))
    const latestAvailable = availableItems[0]
    const representative = latestAvailable ?? items[0]

    return {
      engineId: group.engineId,
      name: group.name,
      engines: items,
      hasAvailableVersion: availableItems.length > 0,
      isDefault: group.engineId === options.defaultEngineId,
      latestVersionLabel: latestAvailable?.engine.version,
      representativeItem: latestAvailable,
      summary: representative?.engine.metadata.description ?? '',
      unavailableCount: items.filter(item => item.engine.availability !== 'available').length,
      versionCount: items.length,
    }
  })
}
