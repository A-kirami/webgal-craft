import { db } from '~/database/db'
import { engineSwitch } from '~/services/engine-switch'
import { AppError } from '~/types/errors'

import { requestImportDependencyResolution } from './request-import-dependency-resolution'

import type { Game } from '~/database/model'
import type {
  ImportDependencyResolutionContext,
  ImportEngineDependencyCompatibilityIssue,
  ResolveImportDependencies,
} from '~/types/import-dependency-resolution'

type RuntimeRebindReason = 'unavailable' | 'incompatible'

interface RequestGameRuntimeRebindOptions {
  compatibilityIssue?: ImportEngineDependencyCompatibilityIssue
  reason?: RuntimeRebindReason
  resolveDependencies?: ResolveImportDependencies
}

interface RuntimeRebindIssue {
  compatibilityIssue?: ImportEngineDependencyCompatibilityIssue
  reason: RuntimeRebindReason
}

export function resolveRuntimeRebindIssue(issue: unknown): RuntimeRebindIssue {
  switch (issue) {
    case 'unavailable': {
      return { reason: 'unavailable' }
    }
    case 'versionInvalid':
    case 'versionTooOld': {
      return { reason: 'incompatible', compatibilityIssue: issue }
    }
    default: {
      return { reason: 'incompatible' }
    }
  }
}

async function buildRuntimeRebindContext(
  game: Game,
  options: RequestGameRuntimeRebindOptions,
): Promise<ImportDependencyResolutionContext> {
  const currentEngine = game.engineId ? await db.engines.get(game.engineId) : undefined
  if (!currentEngine) {
    throw new AppError('IO_ERROR', '当前引擎记录缺失，无法安全重绑', {
      details: { reason: 'ENGINE_NOT_FOUND' },
    })
  }

  const gameName = game.metadata.name?.trim()
  const { compatibilityIssue, reason = 'incompatible' } = options

  return {
    ...(gameName ? { gameName } : {}),
    purpose: 'runtimeRebind',
    source: 'configured',
    engine: {
      current: {
        id: currentEngine.engineId,
        version: currentEngine.version,
      },
      reason,
      ...(reason === 'incompatible' && compatibilityIssue
        ? { compatibilityIssue }
        : {}),
    },
  }
}

export async function requestGameRuntimeRebind(
  game: Game,
  options: RequestGameRuntimeRebindOptions = {},
): Promise<boolean> {
  const resolveDependencies = options.resolveDependencies ?? requestImportDependencyResolution
  const context = await buildRuntimeRebindContext(game, options)
  const result = await resolveDependencies(context)
  if (!result?.engineId) {
    return false
  }

  const selectedEngine = await db.engines.get(result.engineId)
  if (!selectedEngine) {
    throw new AppError('IO_ERROR', '所选引擎已不存在', {
      details: { reason: 'ENGINE_NOT_FOUND' },
    })
  }

  await engineSwitch.switchEngine(game, selectedEngine, { templateDecision: 'keep' })
  return true
}
