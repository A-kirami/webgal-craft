import { compareVersions } from 'compare-versions'

import { normalizeWebgalRuntimeVersion } from './runtime-capabilities'

export interface EngineGameConfigCapabilities {
  cubismMemoryReservedSize: boolean
  legacyExpressionBlendMode: boolean
}

interface EngineGameConfigDeclaration {
  webgalVersion?: string
  live2dSupport?: boolean
}

// 4.6.2 及之前的配置默认可用；更高版本需求见 docs/research/game-config-engine-requirements.md。
const CUBISM_MEMORY_MINIMUM_VERSION = '4.6.6'

export function resolveEngineGameConfigCapabilities(
  declaration: EngineGameConfigDeclaration | undefined,
): EngineGameConfigCapabilities {
  const version = normalizeWebgalRuntimeVersion(declaration?.webgalVersion)

  return {
    cubismMemoryReservedSize: declaration?.live2dSupport === true
      && version !== undefined
      && compareVersions(version, CUBISM_MEMORY_MINIMUM_VERSION) >= 0,
    legacyExpressionBlendMode: declaration?.live2dSupport === true,
  }
}
