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

  return {
    id: 'game-1',
    path: '/games/demo',
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
        path: '/games/demo/cover.png',
        ...previewAssets?.cover,
      },
      icon: {
        path: '/games/demo/icon.png',
        ...previewAssets?.icon,
      },
    },
  }
}

export function createTestEngine(options: TestEngineFactoryOptions = {}): Engine {
  const { metadata, previewAssets, ...rest } = options

  return {
    id: 'engine-1',
    path: '/engines/default',
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
        path: '/engines/default/icon.png',
        ...previewAssets?.icon,
      },
    },
  }
}
