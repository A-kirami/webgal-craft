import type { EngineRef, TemplateBinding } from '~/types/project-config'

/** 按是否已有 project.wgcp 区分游戏的配置状态。 */
export type GameDependencySource = 'configured' | 'unconfigured'

export type GameDependencyResolutionPurpose = 'import' | 'runtimeRebind'

export type GameDependencyIssueReason = 'missing' | 'unavailable' | 'incompatible' | 'selectionRequired'

export type GameEngineDependencyCompatibilityIssue = 'versionInvalid' | 'versionTooOld'

export interface GameEngineDependencyIssue {
  compatibilityIssue?: GameEngineDependencyCompatibilityIssue
  current?: EngineRef
  reason: GameDependencyIssueReason
}

export interface GameTemplateDependencyIssue {
  current: TemplateBinding
  displayName: string
  reason: GameDependencyIssueReason
}

export interface GameDependencyResolutionContext {
  gameName?: string
  purpose: GameDependencyResolutionPurpose
  source: GameDependencySource
  engine?: GameEngineDependencyIssue
  template?: GameTemplateDependencyIssue
  resolvedEngineId?: string
}

export type GameTemplateResolutionResult =
  | { action: 'set', binding: TemplateBinding }
  | { action: 'followEngine' }

export interface GameDependencyResolutionResult {
  engineId?: string
  template?: GameTemplateResolutionResult
}

export type ResolveGameDependencies = (
  context: GameDependencyResolutionContext,
) => Promise<GameDependencyResolutionResult | undefined>
