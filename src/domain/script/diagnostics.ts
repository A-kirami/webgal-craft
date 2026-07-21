import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

export interface DuplicateSceneLabelDiagnostic {
  count: number
  label: string
  statementIndex: number
}

export function diagnoseDuplicateSceneLabels(
  sentences: readonly (ISentence | undefined)[],
): DuplicateSceneLabelDiagnostic[] {
  const definitions = new Map<string, number[]>()

  for (const [statementIndex, sentence] of sentences.entries()) {
    if (sentence?.command !== commandType.label) {
      continue
    }

    const label = sentence.content.trim()
    if (!label) {
      continue
    }

    const indices = definitions.get(label)
    if (indices) {
      indices.push(statementIndex)
    } else {
      definitions.set(label, [statementIndex])
    }
  }

  const diagnostics: DuplicateSceneLabelDiagnostic[] = []
  for (const [label, indices] of definitions) {
    if (indices.length < 2) {
      continue
    }

    for (const statementIndex of indices) {
      diagnostics.push({ count: indices.length, label, statementIndex })
    }
  }

  return diagnostics.toSorted((left, right) => left.statementIndex - right.statementIndex)
}

export interface MissingSceneLabelDiagnostic {
  label: string
  statementIndex: number
}

export function diagnoseMissingSceneLabels(
  sentences: readonly (ISentence | undefined)[],
): MissingSceneLabelDiagnostic[] {
  const definedLabels = new Set<string>()

  for (const sentence of sentences) {
    if (sentence?.command !== commandType.label) {
      continue
    }

    const label = sentence.content.trim()
    if (label) {
      definedLabels.add(label)
    }
  }

  const diagnostics: MissingSceneLabelDiagnostic[] = []
  for (const [statementIndex, sentence] of sentences.entries()) {
    if (sentence?.command !== commandType.jumpLabel) {
      continue
    }

    const label = sentence.content.trim()
    if (label && !definedLabels.has(label)) {
      diagnostics.push({ label, statementIndex })
    }
  }

  return diagnostics
}
