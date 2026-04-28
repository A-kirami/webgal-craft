import { useEngines } from '~/composables/useDatabase'
import { compareEngineVersions } from '~/domain/engine/version'

import type { Engine } from '~/database/model'

export interface EngineGroup {
  engineId: string
  engines: Engine[]
  name: string
}

export function groupEngines(engines: readonly Engine[]): EngineGroup[] {
  const grouped = new Map<string, Engine[]>()

  for (const engine of engines) {
    const currentGroup = grouped.get(engine.engineId) ?? []
    currentGroup.push(engine)
    grouped.set(engine.engineId, currentGroup)
  }

  return [...grouped.entries()]
    .map(([engineId, versions]) => ({
      engineId,
      name: versions[0]?.name ?? engineId,
      engines: versions.toSorted((left, right) => compareEngineVersions(left.version, right.version)),
    }))
    .toSorted((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
}

export function useEngineGroups() {
  const engines = $(useEngines())

  const groups = $computed(() => groupEngines(engines ?? []))

  return $$({
    groups,
  })
}
