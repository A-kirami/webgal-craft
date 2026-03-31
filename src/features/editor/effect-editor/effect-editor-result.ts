import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { setOrRemoveArg } from '~/domain/script/arg-utils'
import { serializeTransform } from '~/features/editor/effect-editor/effect-editor-config'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { Transform } from '~/domain/stage/types'

export interface EffectEditorResult {
  transform: Transform
  duration: string
  ease: string
}

export function applyEffectEditorResultToSentence(
  sentence: ISentence,
  result: Pick<EffectEditorResult, 'transform' | 'duration' | 'ease'>,
): ISentence {
  const newArgs = [...sentence.args]
  let newContent = sentence.content
  const transformJson = serializeTransform(result.transform, { preserveDefaults: true })

  if (sentence.command === commandType.setTransform) {
    newContent = transformJson
  } else {
    setOrRemoveArg(newArgs, 'transform', transformJson)
  }

  setOrRemoveArg(newArgs, 'duration', result.duration)
  setOrRemoveArg(newArgs, 'ease', result.ease)

  return { ...sentence, content: newContent, args: newArgs }
}
