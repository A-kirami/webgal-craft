import type { EngineRef, TemplateBinding } from '~/types/project-config'

export type ImportDependencySource = 'configured' | 'legacy'

export type ImportDependencyResolutionPurpose = 'import' | 'runtimeRebind'

export type ImportDependencyIssueReason = 'missing' | 'unavailable' | 'incompatible' | 'selectionRequired'

export type ImportEngineDependencyCompatibilityIssue = 'versionInvalid' | 'versionTooOld'

export interface ImportEngineDependencyIssue {
  compatibilityIssue?: ImportEngineDependencyCompatibilityIssue
  current?: EngineRef
  reason: ImportDependencyIssueReason
}

export interface ImportTemplateDependencyIssue {
  current: TemplateBinding
  displayName: string
  reason: ImportDependencyIssueReason
}

export interface ImportDependencyResolutionContext {
  gameName?: string
  purpose: ImportDependencyResolutionPurpose
  source: ImportDependencySource
  engine?: ImportEngineDependencyIssue
  template?: ImportTemplateDependencyIssue
  resolvedEngineId?: string
}

export type ImportTemplateResolutionResult =
  | { action: 'set', binding: TemplateBinding }
  | { action: 'followEngine' }

export interface ImportDependencyResolutionResult {
  engineId?: string
  template?: ImportTemplateResolutionResult
}

export type ResolveImportDependencies = (
  context: ImportDependencyResolutionContext,
) => Promise<ImportDependencyResolutionResult | undefined>
