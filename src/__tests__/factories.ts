import type { Engine, Game } from '~/database/model'

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
  const { metadata, previewAssets, ...rest } = options
  const resolvedGamePath = rest.path ?? '/games/demo'

  return {
    id: 'game-1',
    path: resolvedGamePath,
    createdAt: 0,
    lastModified: 0,
    status: 'created',
    ...rest,
    metadata: {
      name: 'Demo Game',
      ...metadata,
    },
    previewAssets: {
      cover: {
        path: `${resolvedGamePath}/cover.png`,
        ...previewAssets?.cover,
      },
      icon: {
        path: `${resolvedGamePath}/icon.png`,
        ...previewAssets?.icon,
      },
    },
  }
}

export function createTestEngine(options: TestEngineFactoryOptions = {}): Engine {
  const { metadata, previewAssets, ...rest } = options
  const resolvedEnginePath = rest.path ?? '/engines/default'

  return {
    id: 'engine-1',
    path: resolvedEnginePath,
    createdAt: 0,
    status: 'created',
    ...rest,
    metadata: {
      description: 'Default engine',
      name: 'Default Engine',
      ...metadata,
    },
    previewAssets: {
      icon: {
        path: `${resolvedEnginePath}/icon.png`,
        ...previewAssets?.icon,
      },
    },
  }
}
