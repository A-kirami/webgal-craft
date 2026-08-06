import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import {
  isExtendedFigurePosition,
  isExtendedFigurePositionTargetId,
} from '~/domain/script/types'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

export interface UnsupportedFigurePositionReference {
  fieldKey: string
  value: string
}

const TARGET_ARGUMENT_KEYS = new Set(['figureId', 'target'])

export function findUnsupportedFigurePositionReferences(
  sentence: ISentence,
): UnsupportedFigurePositionReference[] {
  const references: UnsupportedFigurePositionReference[] = []

  for (const argument of sentence.args) {
    if (argument.value === true && isExtendedFigurePosition(argument.key)) {
      if (sentence.command === commandType.say) {
        references.push({ fieldKey: 'figureId', value: argument.key })
      } else if (sentence.command === commandType.changeFigure) {
        references.push({ fieldKey: 'position', value: argument.key })
      }
    }

    if (TARGET_ARGUMENT_KEYS.has(argument.key)
      && typeof argument.value === 'string'
      && isExtendedFigurePositionTargetId(argument.value)) {
      references.push({ fieldKey: argument.key, value: argument.value })
    }
  }

  return references
}
