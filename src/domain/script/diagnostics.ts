import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { hasVariableInterpolation } from './variable-interpolation'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

/**
 * 读取标签名。空标签与含变量插值的标签都返回 undefined：
 * 后者在运行时才成形，既不能算作静态定义，也不能参与静态匹配。
 */
function readStaticLabel(sentence: ISentence): string | undefined {
  const label = sentence.content.trim()
  return label && !hasVariableInterpolation(label) ? label : undefined
}

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

    const label = readStaticLabel(sentence)
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

    const label = readStaticLabel(sentence)
    if (label) {
      definedLabels.add(label)
    }
  }

  const diagnostics: MissingSceneLabelDiagnostic[] = []
  for (const [statementIndex, sentence] of sentences.entries()) {
    if (sentence?.command !== commandType.jumpLabel) {
      continue
    }

    const label = readStaticLabel(sentence)
    if (label && !definedLabels.has(label)) {
      diagnostics.push({ label, statementIndex })
    }
  }

  return diagnostics
}
