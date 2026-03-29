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
  const { metadata, path, previewAssets, ...rest } = options
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
        path: coverPath ?? `${resolvedGamePath}/cover.png`,
        ...cover,
      },
      icon: {
        path: iconPath ?? `${resolvedGamePath}/icon.png`,
        ...icon,
      },
    },
  }
}

export function createTestEngine(options: TestEngineFactoryOptions = {}): Engine {
  const { metadata, path, previewAssets, ...rest } = options
  const resolvedEnginePath = path ?? '/engines/default'
  const { icon: rawIcon } = previewAssets ?? {}
  const { path: iconPath, ...icon } = rawIcon ?? {}

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
        path: iconPath ?? `${resolvedEnginePath}/icon.png`,
        ...icon,
      },
    },
  }
}
