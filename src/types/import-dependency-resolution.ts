import type { EngineRef, TemplateBinding } from '~/types/project-config'

export type ImportDependencySource = 'configured' | 'legacy'

export type ImportDependencyIssueReason = 'missing' | 'unavailable' | 'selectionRequired'

export interface ImportEngineDependencyIssue {
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
