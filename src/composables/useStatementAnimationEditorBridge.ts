import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { createStatementIdTarget, StatementUpdatePayload, StatementUpdateTarget } from '~/composables/useStatementEditor'
import { serializeSentence } from '~/helper/webgal-script/serialize'
import { parseAnimationDocument } from '~/models/animation-document-codec'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { AnimationFrame } from '~/types/stage'

interface UseStatementAnimationEditorBridgeOptions {
  updateTarget?: MaybeRefOrGetter<StatementUpdateTarget | undefined>
  parsed: MaybeRefOrGetter<ISentence | undefined>
  emitUpdate: (payload: StatementUpdatePayload) => void
}

export type StatementAnimationEditorOpenOverride = (
  parsed: ISentence,
  onApply: (frames: AnimationFrame[]) => void,
) => void

export const STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY: InjectionKey<StatementAnimationEditorOpenOverride> =
  Symbol('statementAnimationEditorOpenOverride')

export function applyAnimationEditorResultToSentence(sentence: ISentence, frames: readonly AnimationFrame[]): ISentence {
  return {
    ...sentence,
    content: JSON.stringify(frames),
  }
}

export function parseStatementAnimationFrames(sentence: ISentence): AnimationFrame[] {
  if (sentence.command !== commandType.setTempAnimation) {
    return []
  }

  return parseAnimationDocument(sentence.content)
}

export function useStatementAnimationEditorBridge(options: UseStatementAnimationEditorBridgeOptions) {
  const updateTarget = computed(() => toValue(options.updateTarget))
  const parsed = computed(() => toValue(options.parsed))
  const overriddenOpen = inject(STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY, undefined)

  function applyAnimationEditorResult(frames: AnimationFrame[]) {
    if (!parsed.value) {
      return
    }

    const newSentence = applyAnimationEditorResultToSentence(parsed.value, frames)
    const target = updateTarget.value ?? createStatementIdTarget(0)

    options.emitUpdate({
      target,
      rawText: serializeSentence(newSentence),
      parsed: newSentence,
      source: 'visual',
    })
  }

  function openAnimationEditor() {
    if (!parsed.value) {
      return
    }

    if (overriddenOpen) {
      overriddenOpen(parsed.value, applyAnimationEditorResult)
      return
    }

    logger.warn('未注入高级动画编辑器 provider，无法打开高级动画编辑器')
  }

  return {
    openAnimationEditor,
    applyAnimationEditorResult,
  }
}
