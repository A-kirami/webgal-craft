import type { Engine, Game } from '~/database/model'

interface TestGameFactoryOptions extends Partial<Omit<Game, 'metadata'>> {
  metadata?: Partial<Game['metadata']>
}

interface TestEngineFactoryOptions extends Partial<Omit<Engine, 'metadata'>> {
  metadata?: Partial<Engine['metadata']>
}

export function createTestGame(options: TestGameFactoryOptions = {}): Game {
  const { metadata, ...rest } = options

  return {
    id: 'game-1',
    path: '/games/demo',
    createdAt: 0,
    lastModified: 0,
    status: 'created',
    ...rest,
    metadata: {
      cover: '/games/demo/cover.png',
      icon: '/games/demo/icon.png',
      name: 'Demo Game',
      ...metadata,
    },
  }
}

export function createTestEngine(options: TestEngineFactoryOptions = {}): Engine {
  const { metadata, ...rest } = options

  return {
    id: 'engine-1',
    path: '/engines/default',
    createdAt: 0,
    status: 'created',
    ...rest,
    metadata: {
      description: 'Default engine',
      icon: '/engines/default/icon.png',
      name: 'Default Engine',
      ...metadata,
    },
  }
}
