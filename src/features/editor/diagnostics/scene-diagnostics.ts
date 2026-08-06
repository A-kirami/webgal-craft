import { diagnoseDuplicateSceneLabels, diagnoseMissingSceneLabels } from '~/domain/script/diagnostics'
import { findUnsupportedFigurePositionReferences } from '~/domain/script/figure-position-diagnostics'
import {
  findMissingSentenceResourceReferences,
  findUnsupportedEngineModelReferences,
  findUnsupportedEngineOpusVocalReferences,
} from '~/features/editor/command-registry/diagnostics'

import type { SceneEditorDiagnostic } from './types'
import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { EngineModelCapabilities } from '~/domain/engine/model-capabilities'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'
import type { AssetKey } from '~/services/resource-index/keys'

interface DiagnoseSceneOptions {
  engineCapabilities?: EngineModelCapabilities
  hasAssetKey?: (key: AssetKey) => boolean
  runtimeCapabilities?: Pick<EngineRuntimeCapabilities, 'figurePositions' | 'opusVocalShorthand'>
}

export function diagnoseScene(
  sentences: readonly (ISentence | undefined)[],
  options: DiagnoseSceneOptions = {},
): SceneEditorDiagnostic[] {
  const diagnostics: SceneEditorDiagnostic[] = diagnoseDuplicateSceneLabels(sentences)
    .map(diagnostic => ({
      code: 'duplicate-label',
      count: diagnostic.count,
      field: { kind: 'content' },
      label: diagnostic.label,
      severity: 'warning',
      source: 'scene',
      statementIndex: diagnostic.statementIndex,
    }))

  for (const diagnostic of diagnoseMissingSceneLabels(sentences)) {
    diagnostics.push({
      code: 'missing-label',
      field: { kind: 'content' },
      label: diagnostic.label,
      severity: 'error',
      source: 'scene',
      statementIndex: diagnostic.statementIndex,
    })
  }

  if (options.hasAssetKey) {
    for (const [statementIndex, sentence] of sentences.entries()) {
      if (!sentence) {
        continue
      }

      for (const reference of findMissingSentenceResourceReferences(sentence, options.hasAssetKey)) {
        diagnostics.push({
          assetKey: reference.assetKey,
          code: 'missing-resource',
          field: reference.source,
          severity: 'error',
          source: 'resource',
          statementIndex,
          value: reference.value,
        })
      }
    }
  }

  if (options.engineCapabilities || options.runtimeCapabilities) {
    for (const [statementIndex, sentence] of sentences.entries()) {
      if (!sentence) {
        continue
      }

      if (options.engineCapabilities) {
        for (const reference of findUnsupportedEngineModelReferences(sentence, options.engineCapabilities)) {
          diagnostics.push({
            code: reference.modelType === 'live2d' ? 'unsupported-live2d' : 'unsupported-spine',
            field: reference.source,
            severity: 'warning',
            source: 'engine',
            statementIndex,
            value: reference.value,
          })
        }
      }

      if (options.runtimeCapabilities) {
        for (const reference of findUnsupportedEngineOpusVocalReferences(sentence, options.runtimeCapabilities)) {
          diagnostics.push({
            code: 'unsupported-opus-vocal',
            field: reference.source,
            severity: 'warning',
            source: 'engine',
            statementIndex,
            value: reference.value,
          })
        }
      }
    }
  }

  if (options.runtimeCapabilities?.figurePositions === false) {
    for (const [statementIndex, sentence] of sentences.entries()) {
      if (!sentence) {
        continue
      }

      for (const reference of findUnsupportedFigurePositionReferences(sentence)) {
        diagnostics.push({
          code: 'unsupported-figure-position',
          field: { kind: 'argument', key: reference.fieldKey },
          severity: 'warning',
          source: 'engine',
          statementIndex,
          value: reference.value,
        })
      }
    }
  }

  return diagnostics.toSorted((left, right) =>
    (left.statementIndex ?? -1) - (right.statementIndex ?? -1),
  )
}
