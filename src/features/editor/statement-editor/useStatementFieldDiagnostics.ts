import { findUnsupportedFigurePositionReferences } from '~/domain/script/figure-position-diagnostics'
import {
  findMissingSentenceResourceReferences,
  findUnsupportedEngineModelReferences,
} from '~/features/editor/command-registry/diagnostics'
import { getDiagnosticFieldStatus } from '~/features/editor/diagnostics/presentation'
import { selectHighestDiagnosticSeverity } from '~/features/editor/diagnostics/types'
import { isSameResourceReferenceSource } from '~/services/resource-index/reference-query'
import { useResourceIndex } from '~/services/resource-index/service'
import { useResourceStore } from '~/stores/resource'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'
import type { UnsupportedEngineModelReference } from '~/features/editor/command-registry/diagnostics'
import type { DiagnosticFieldStatus } from '~/features/editor/diagnostics/presentation'
import type { EditorFieldDiagnostic, SceneEditorDiagnostic } from '~/features/editor/diagnostics/types'
import type { ResourceReferenceQuery, ResourceReferenceSource } from '~/services/resource-index/reference-query'

export interface UseStatementFieldDiagnosticsOptions {
  parsed: MaybeRefOrGetter<ISentence | undefined>
  /** Undefined only for drafts that are not attached to an analyzed scene document. */
  diagnostics?: MaybeRefOrGetter<readonly SceneEditorDiagnostic[] | undefined>
  runtimeCapabilities?: MaybeRefOrGetter<Pick<EngineRuntimeCapabilities, 'figurePositions'>>
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

function toLocalUnsupportedEngineModelDiagnostic(
  reference: UnsupportedEngineModelReference,
): EditorFieldDiagnostic {
  return {
    code: reference.modelType === 'live2d' ? 'unsupported-live2d' : 'unsupported-spine',
    field: reference.source,
    severity: 'warning',
    source: 'engine',
    value: reference.value,
  }
}

function toLocalUnsupportedFigurePositionDiagnostic(
  fieldKey: string,
  value: string,
): EditorFieldDiagnostic {
  return {
    code: 'unsupported-figure-position',
    field: { kind: 'argument', key: fieldKey },
    severity: 'warning',
    source: 'engine',
    value,
  }
}

export function useStatementFieldDiagnostics(options: UseStatementFieldDiagnosticsOptions) {
  const resourceIndex = useResourceIndex()
  const resourceStore = useResourceStore()

  const publishedDiagnostics = computed(() =>
    options.diagnostics === undefined ? undefined : toValue(options.diagnostics),
  )
  const localDiagnostics = computed<readonly EditorFieldDiagnostic[]>(() => {
    const parsed = toValue(options.parsed)
    if (!parsed) {
      return []
    }

    const diagnostics: EditorFieldDiagnostic[] = []
    if (resourceStore.currentEngineCapabilities) {
      diagnostics.push(...findUnsupportedEngineModelReferences(
        parsed,
        resourceStore.currentEngineCapabilities,
      ).map(reference => toLocalUnsupportedEngineModelDiagnostic(reference)))
    }

    if (toValue(options.runtimeCapabilities)?.figurePositions === false) {
      diagnostics.push(...findUnsupportedFigurePositionReferences(parsed).map(reference =>
        toLocalUnsupportedFigurePositionDiagnostic(reference.fieldKey, reference.value),
      ))
    }

    if (resourceIndex.status.value === 'ready') {
      diagnostics.push(...findMissingSentenceResourceReferences(
        parsed,
        key => resourceIndex.hasAssetKey(key),
      ).map(reference => toLocalMissingResourceDiagnostic(reference)))
    }

    return diagnostics
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
