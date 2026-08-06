import { ensureParsed } from '~/domain/script/sentence'
import { diagnoseScene } from '~/features/editor/diagnostics/scene-diagnostics'

import type { EditorDiagnostic } from './types'
import type { EngineModelCapabilities } from '~/domain/engine/model-capabilities'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'
import type { StatementEntry } from '~/domain/script/sentence'
import type { AssetKey } from '~/services/resource-index/keys'

interface EditorDiagnosticTextProjection {
  kind: string
  syncError?: 'invalid-animation-json'
}

interface EditorDiagnosticVisualProjection {
  kind: string
  runtimeCapabilities?: Pick<EngineRuntimeCapabilities, 'figurePositions' | 'opusVocalShorthand'>
  statements?: readonly StatementEntry[]
}

interface DiagnoseEditorDocumentOptions {
  engineCapabilities?: EngineModelCapabilities
  hasAssetKey?: (key: AssetKey) => boolean
  runtimeCapabilities?: Pick<EngineRuntimeCapabilities, 'figurePositions' | 'opusVocalShorthand'>
  textProjection?: EditorDiagnosticTextProjection
  visualProjection?: EditorDiagnosticVisualProjection
}

export function diagnoseEditorDocument(options: DiagnoseEditorDocumentOptions): EditorDiagnostic[] {
  if (options.textProjection?.kind === 'animation' && options.textProjection.syncError === 'invalid-animation-json') {
    return [{
      code: 'invalid-animation-json',
      severity: 'error',
      source: 'document',
    }]
  }

  if (options.visualProjection?.kind !== 'scene' || !options.visualProjection.statements) {
    return []
  }

  return diagnoseScene(
    options.visualProjection.statements.map(statement => ensureParsed(statement)),
    {
      engineCapabilities: options.engineCapabilities,
      hasAssetKey: options.hasAssetKey,
      runtimeCapabilities: options.visualProjection.runtimeCapabilities ?? options.runtimeCapabilities,
    },
  )
}
