import { normalizeImportPath } from '~/services/resource-health'

import type { Engine, Game, Template } from '~/database/model'

interface TestGameFactoryOptions extends Partial<Omit<Game, 'metadata' | 'previewAssets'>> {
  metadata?: Partial<Game['metadata']>
  previewAssets?: {
    cover?: Partial<Game['previewAssets']['cover']>
    icon?: Partial<Game['previewAssets']['icon']>
  }
}

interface TestEngineFactoryOptions extends Partial<Omit<Engine, 'metadata' | 'previewAssets'>> {
  metadata?: Partial<Engine['metadata']>
  previewAssets?: {
    icon?: Partial<Engine['previewAssets']['icon']>
  }
}

export function createTestGame(options: TestGameFactoryOptions = {}): Game {
  const {
    metadata,
    path,
    pathLookupKey,
    previewAssets,
    ...rest
  } = options
  const resolvedGamePath = path ?? '/games/demo'
  const {
    cover: rawCover,
    icon: rawIcon,
  } = previewAssets ?? {}
  const { path: coverPath, ...cover } = rawCover ?? {}
  const { path: iconPath, ...icon } = rawIcon ?? {}

  return {
    id: 'game-1',
    path: resolvedGamePath,
    pathLookupKey: pathLookupKey ?? normalizeImportPath(resolvedGamePath).lookupKey,
    createdAt: 0,
    lastModified: 0,
    status: 'created',
    availability: 'available',
    ...rest,
    metadata: {
      name: 'Demo Game',
      titleImg: 'cover.png',
      ...metadata,
    },
    previewAssets: {
      cover: {
        path: coverPath ?? 'game/background/cover.png',
        ...cover,
      },
      icon: {
        path: iconPath ?? 'icons/favicon.ico',
        ...icon,
      },
    },
  }
}

export function createTestEngine(options: TestEngineFactoryOptions = {}): Engine {
  const {
    metadata,
    path,
    pathLookupKey,
    previewAssets,
    ...rest
  } = options
  const resolvedEnginePath = path ?? '/engines/default'
  const { icon: rawIcon } = previewAssets ?? {}
  const { path: iconPath, ...icon } = rawIcon ?? {}
  const defaultName = options.name ?? 'Default Engine'
  const defaultEngineId = options.engineId ?? 'default-publisher.default-engine'

  return {
    id: 'engine-1',
    path: resolvedEnginePath,
    pathLookupKey: pathLookupKey ?? normalizeImportPath(resolvedEnginePath).lookupKey,
    engineId: defaultEngineId,
    name: defaultName,
    createdAt: 0,
    version: options.version,
    status: 'created',
    availability: 'available',
    ...rest,
    metadata: {
      description: 'Default engine',
      icon: 'icons/favicon.ico',
      ...metadata,
    },
    previewAssets: {
      icon: {
        path: iconPath ?? `${resolvedEnginePath}/icon.png`,
        ...icon,
      },
    },
  }
}

export function createTestTemplate(options: Partial<Template> = {}): Template {
  return {
    id: 'template-1',
    path: '/templates/default',
    createdAt: 0,
    status: 'created',
    availability: 'available',
    ...options,
    metadata: {
      name: 'Default Template',
      ...options.metadata,
    },
  }
}
