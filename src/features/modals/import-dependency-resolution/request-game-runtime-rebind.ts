import { projectConfigCmds } from '~/commands/project-config'
import { db } from '~/database/db'
import { engineSwitch } from '~/services/engine-switch'
import { AppError } from '~/types/errors'

import { requestImportDependencyResolution } from './request-import-dependency-resolution'

import type { Game } from '~/database/model'
import type { AbsPath } from '~/domain/path'
import type {
  ImportDependencyResolutionContext,
  ImportEngineDependencyCompatibilityIssue,
  ResolveImportDependencies,
} from '~/types/import-dependency-resolution'
import type { EngineRef } from '~/types/project-config'

type RuntimeRebindReason = 'incompatible' | 'missing' | 'unavailable'

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
    case 'missing': {
      return { reason: 'missing' }
    }
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

/** 绑定悬空时用项目配置的逻辑引用作展示，读不出来就不展示当前引擎 */
async function readProjectEngineRef(gamePath: AbsPath): Promise<EngineRef | undefined> {
  try {
    const config = await projectConfigCmds.readProjectConfig(gamePath)
    return config.engine
  } catch {
    return
  }
}

async function buildRuntimeRebindContext(
  game: Game,
  options: RequestGameRuntimeRebindOptions,
): Promise<ImportDependencyResolutionContext> {
  const currentEngine = game.engineId ? await db.engines.get(game.engineId) : undefined
  const gameName = game.metadata.name?.trim()
  // 记录缺失本身就意味着需要重选运行时，调用方没显式给出原因时按 missing 上报
  const { compatibilityIssue, reason = currentEngine ? 'incompatible' : 'missing' } = options
  const current: EngineRef | undefined = currentEngine
    ? { id: currentEngine.engineId, version: currentEngine.version }
    : await readProjectEngineRef(game.path)

  return {
    ...(gameName ? { gameName } : {}),
    purpose: 'runtimeRebind',
    source: 'configured',
    engine: {
      ...(current ? { current } : {}),
      reason,
      ...(reason === 'incompatible' && compatibilityIssue
        ? { compatibilityIssue }
        : {}),
    },
  }
}

/**
 * 需要用户重选运行时的错误：引擎不可用/不兼容，或绑定悬空且项目配置的逻辑引用也解析不出引擎。
 * 这两种情况下工程都跑不起来，但都可以通过重选引擎恢复，入口必须保留给用户。
 */
export function isRuntimeRebindRequired(error: unknown): error is AppError {
  if (!(error instanceof AppError)) {
    return false
  }

  return error.code === 'ENGINE_EDITOR_INCOMPATIBLE'
    || (error.code === 'IO_ERROR' && error.details?.issue === 'missing')
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
