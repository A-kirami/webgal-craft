import type { DiagnosticSeverity, EditorFieldDiagnostic } from './types'
import type { I18nT } from '~/utils/i18n-like'

export type DiagnosticFieldStatus = 'none' | 'warning' | 'error'

export function getDiagnosticFieldStatus(severity: DiagnosticSeverity | undefined): DiagnosticFieldStatus {
  if (severity === 'error') {
    return 'error'
  }
  return severity === 'warning' ? 'warning' : 'none'
}

export function getDiagnosticSeverityTextClass(severity: DiagnosticSeverity | undefined): string | undefined {
  switch (severity) {
    case 'error': {
      return 'text-destructive'
    }
    case 'warning': {
      return 'text-yellow-700 dark:text-yellow-300'
    }
    case 'info': {
      return 'text-blue-600 dark:text-blue-400'
    }
    case 'hint': {
      return 'text-muted-foreground'
    }
    default: {
      return undefined
    }
  }
}

export function getEditorDiagnosticMessage(
  diagnostic: EditorFieldDiagnostic,
  t: I18nT,
): string {
  switch (diagnostic.code) {
    case 'duplicate-label': {
      return t('edit.diagnostics.duplicateLabel', {
        label: diagnostic.label,
        count: diagnostic.count,
      })
    }
    case 'missing-label': {
      return t('edit.diagnostics.missingLabel', { label: diagnostic.label })
    }
    case 'missing-resource': {
      return t('edit.completion.missingResource', { path: diagnostic.value })
    }
    default: {
      const exhaustiveCheck: never = diagnostic
      return exhaustiveCheck
    }
  }
}
