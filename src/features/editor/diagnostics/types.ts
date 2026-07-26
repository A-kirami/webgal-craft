import type { AssetKey } from '~/services/resource-index/keys'
import type { ResourceReferenceSource } from '~/services/resource-index/reference-query'

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint'
export type EditorDiagnosticSource = 'document' | 'scene' | 'resource' | 'engine'

interface EditorDiagnosticBase {
  code: string
  severity: DiagnosticSeverity
  source: EditorDiagnosticSource
}

interface SceneEditorDiagnosticBase extends EditorDiagnosticBase {
  field: ResourceReferenceSource
  statementIndex: number
}

export interface DuplicateLabelEditorDiagnostic extends SceneEditorDiagnosticBase {
  code: 'duplicate-label'
  count: number
  field: { kind: 'content' }
  label: string
  severity: 'warning'
  source: 'scene'
}

export interface MissingLabelEditorDiagnostic extends SceneEditorDiagnosticBase {
  code: 'missing-label'
  field: { kind: 'content' }
  label: string
  severity: 'error'
  source: 'scene'
}

export interface MissingResourceEditorDiagnostic extends SceneEditorDiagnosticBase {
  assetKey: AssetKey
  code: 'missing-resource'
  severity: 'error'
  source: 'resource'
  value: string
}

export interface UnsupportedLive2dEditorDiagnostic extends SceneEditorDiagnosticBase {
  code: 'unsupported-live2d'
  severity: 'warning'
  source: 'engine'
  value: string
}

export interface UnsupportedSpineEditorDiagnostic extends SceneEditorDiagnosticBase {
  code: 'unsupported-spine'
  severity: 'warning'
  source: 'engine'
  value: string
}

export interface InvalidAnimationDocumentDiagnostic extends EditorDiagnosticBase {
  code: 'invalid-animation-json'
  severity: 'error'
  source: 'document'
}

export type SceneEditorDiagnostic =
  | DuplicateLabelEditorDiagnostic
  | MissingLabelEditorDiagnostic
  | MissingResourceEditorDiagnostic
  | UnsupportedLive2dEditorDiagnostic
  | UnsupportedSpineEditorDiagnostic

export type EditorFieldDiagnostic =
  | Omit<DuplicateLabelEditorDiagnostic, 'statementIndex'>
  | Omit<MissingLabelEditorDiagnostic, 'statementIndex'>
  | Omit<MissingResourceEditorDiagnostic, 'statementIndex'>
  | Omit<UnsupportedLive2dEditorDiagnostic, 'statementIndex'>
  | Omit<UnsupportedSpineEditorDiagnostic, 'statementIndex'>

export type EditorDiagnostic =
  | SceneEditorDiagnostic
  | InvalidAnimationDocumentDiagnostic

const DIAGNOSTIC_SEVERITY_RANK: Record<DiagnosticSeverity, number> = {
  error: 4,
  warning: 3,
  info: 2,
  hint: 1,
}

export function selectHighestDiagnosticSeverity(
  diagnostics: readonly Pick<EditorDiagnostic, 'severity'>[],
): DiagnosticSeverity | undefined {
  let highest: DiagnosticSeverity | undefined

  for (const diagnostic of diagnostics) {
    if (!highest || DIAGNOSTIC_SEVERITY_RANK[diagnostic.severity] > DIAGNOSTIC_SEVERITY_RANK[highest]) {
      highest = diagnostic.severity
    }
  }

  return highest
}
