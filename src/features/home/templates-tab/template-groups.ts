import { joinPath } from '~/utils/path'

import type { Engine, Template } from '~/database/model'

export type TemplateGroupSourceKind = 'standalone' | 'engineBuiltin'

export interface StandaloneTemplateSourceItem {
  kind: 'standalone'
  templateId: string
  name: string
  path: string
  createdAt: number
  webgalVersion?: string
}

export interface EngineBuiltinTemplateSourceItem {
  kind: 'engineBuiltin'
  engineId: string
  engineName: string
  engineVersion?: string
  enginePath: string
  templatePath: string
  createdAt: number
}

export type TemplateGroupSourceItem =
  | StandaloneTemplateSourceItem
  | EngineBuiltinTemplateSourceItem

export interface TemplateGroupViewModel {
  key: string
  name: string
  sourceKind: TemplateGroupSourceKind
  sources: TemplateGroupSourceItem[]
}

function createStandaloneTemplateGroup(template: Template): TemplateGroupViewModel {
  return {
    key: `standalone:${template.metadata.name}`,
    name: template.metadata.name,
    sourceKind: 'standalone',
    sources: [
      {
        kind: 'standalone',
        templateId: template.id,
        name: template.metadata.name,
        path: template.path,
        createdAt: template.createdAt,
        webgalVersion: template.metadata.webgalVersion,
      },
    ],
  }
}

function createEngineBuiltinTemplateSource(engine: Engine): EngineBuiltinTemplateSourceItem {
  return {
    kind: 'engineBuiltin',
    engineId: engine.id,
    engineName: engine.name,
    engineVersion: engine.version,
    enginePath: engine.path,
    templatePath: joinPath(engine.path, 'game', 'template'),
    createdAt: engine.createdAt,
  }
}

export function createTemplateGroups(
  templates: readonly Template[],
  engines: readonly Engine[],
): TemplateGroupViewModel[] {
  const standaloneGroups = templates
    .map(template => createStandaloneTemplateGroup(template))
    .toSorted((a, b) => {
      const createdAtDelta = b.sources[0]!.createdAt - a.sources[0]!.createdAt
      return createdAtDelta === 0 ? a.name.localeCompare(b.name) : createdAtDelta
    })

  const engineBuiltinGroups = new Map<string, TemplateGroupViewModel>()
  const sortedEngines = engines.toSorted((a, b) => {
    const createdAtDelta = b.createdAt - a.createdAt
    return createdAtDelta === 0 ? b.path.localeCompare(a.path) : createdAtDelta
  })

  for (const engine of sortedEngines) {
    const group = engineBuiltinGroups.get(engine.engineId)
    const source = createEngineBuiltinTemplateSource(engine)

    if (group) {
      group.sources.push(source)
      continue
    }

    engineBuiltinGroups.set(engine.engineId, {
      key: `engineBuiltin:${engine.engineId}`,
      name: engine.name,
      sourceKind: 'engineBuiltin',
      sources: [source],
    })
  }

  return [
    ...standaloneGroups,
    ...engineBuiltinGroups.values(),
  ]
}
