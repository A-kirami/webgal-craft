import { findMissingSentenceResourceReferences } from '~/features/editor/command-registry/diagnostics'
import { getDiagnosticFieldStatus } from '~/features/editor/diagnostics/presentation'
import { selectHighestDiagnosticSeverity } from '~/features/editor/diagnostics/types'
import { isSameResourceReferenceSource } from '~/services/resource-index/reference-query'
import { useResourceIndex } from '~/services/resource-index/service'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { DiagnosticFieldStatus } from '~/features/editor/diagnostics/presentation'
import type { EditorFieldDiagnostic, SceneEditorDiagnostic } from '~/features/editor/diagnostics/types'
import type { ResourceReferenceQuery, ResourceReferenceSource } from '~/services/resource-index/reference-query'

export interface UseStatementFieldDiagnosticsOptions {
  parsed: MaybeRefOrGetter<ISentence | undefined>
  /** Undefined only for drafts that are not attached to an analyzed scene document. */
  diagnostics?: MaybeRefOrGetter<readonly SceneEditorDiagnostic[] | undefined>
}

function toLocalMissingResourceDiagnostic(reference: ResourceReferenceQuery): EditorFieldDiagnostic {
  return {
    assetKey: reference.assetKey,
    code: 'missing-resource',
    field: reference.source,
    severity: 'error',
    source: 'resource',
    value: reference.value,
  }
}

export function useStatementFieldDiagnostics(options: UseStatementFieldDiagnosticsOptions) {
  const resourceIndex = useResourceIndex()

  const publishedDiagnostics = computed(() =>
    options.diagnostics === undefined ? undefined : toValue(options.diagnostics),
  )
  const localDiagnostics = computed<readonly EditorFieldDiagnostic[]>(() => {
    const parsed = toValue(options.parsed)
    if (!parsed || resourceIndex.status.value !== 'ready') {
      return []
    }

    return findMissingSentenceResourceReferences(
      parsed,
      key => resourceIndex.hasAssetKey(key),
    ).map(reference => toLocalMissingResourceDiagnostic(reference))
  })

  function getFieldDiagnostics(field: ResourceReferenceSource): readonly EditorFieldDiagnostic[] {
    const diagnostics = publishedDiagnostics.value ?? localDiagnostics.value
    return diagnostics.filter(diagnostic =>
      isSameResourceReferenceSource(diagnostic.field, field),
    )
  }

  function getFieldStatus(field: ResourceReferenceSource): DiagnosticFieldStatus {
    return getDiagnosticFieldStatus(selectHighestDiagnosticSeverity(getFieldDiagnostics(field)))
  }

  return {
    getFieldDiagnostics,
    getFieldStatus,
  }
}
