import { toEngineCollectionItem } from '~/features/home/home-collection-items'

import type { Engine } from '~/database/model'
import type {
  EngineCollectionItem,
  TemplateCollectionItem,
} from '~/features/home/home-collection-items'
import type {
  EngineBuiltinTemplateSourceItem,
  TemplateGroupViewModel,
} from '~/features/home/templates-tab/template-groups'

interface BuildTemplateCollectionItemsOptions {
  engines: readonly Engine[]
  resolveServeUrl: (path: string) => string | undefined
  templateGroups: readonly TemplateGroupViewModel[]
}

function resolveRepresentativeEngineSource(
  templateGroup: TemplateGroupViewModel,
): EngineBuiltinTemplateSourceItem | undefined {
  if (templateGroup.sourceKind !== 'engineBuiltin') {
    return undefined
  }

  return templateGroup.sources.find((source): source is EngineBuiltinTemplateSourceItem =>
    source.kind === 'engineBuiltin',
  )
}

function resolveRepresentativeEngineItem(
  templateGroup: TemplateGroupViewModel,
  enginesById: ReadonlyMap<string, Engine>,
  resolveServeUrl: (path: string) => string | undefined,
): EngineCollectionItem | undefined {
  const source = resolveRepresentativeEngineSource(templateGroup)
  if (!source) {
    return undefined
  }

  const engine = enginesById.get(source.engineId)
  if (!engine) {
    return undefined
  }

  return toEngineCollectionItem(engine, resolveServeUrl)
}

export function buildTemplateCollectionItems(
  options: BuildTemplateCollectionItemsOptions,
): TemplateCollectionItem[] {
  const enginesById = new Map(options.engines.map(engine => [engine.id, engine]))

  return options.templateGroups.map(templateGroup => ({
    representativeEngineItem: resolveRepresentativeEngineItem(
      templateGroup,
      enginesById,
      options.resolveServeUrl,
    ),
    templateGroup,
  }))
}
