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
    .map(([engineId, versions]) => {
      const sortedVersions = versions.toSorted((left, right) => compareEngineVersions(left.version, right.version))
      // 取最新版本的 name 作为分组显示名
      return {
        engineId,
        name: sortedVersions[0]?.name ?? engineId,
        engines: sortedVersions,
      }
    })
    .toSorted((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
}

export function useEngineGroups() {
  const engines = $(useEngines())

  const groups = $computed(() => groupEngines(engines ?? []))

  return $$({
    groups,
  })
}
