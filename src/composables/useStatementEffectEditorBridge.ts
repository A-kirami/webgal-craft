import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { useInjectedEffectEditorProvider } from '~/composables/useEffectEditorProvider'
import { createStatementIdTarget, StatementUpdatePayload, StatementUpdateTarget } from '~/composables/useStatementEditor'
import { serializeTransform } from '~/helper/effect-editor-config'
import { setOrRemoveArg } from '~/helper/webgal-script/arg-utils'
import { hasSentenceTruthyFlag, readSentenceArgString } from '~/helper/webgal-script/sentence'
import { serializeSentence } from '~/helper/webgal-script/serialize'
import { computeLineNumberFromStatementId } from '~/models/scene-selection'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { Transform } from '~/types/stage'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { SceneVisualProjectionState, TextProjectionState } from '~/stores/editor'

export interface EffectEditorResult {
  transform: Transform
  duration: string
  ease: string
}

interface UseStatementEffectEditorBridgeOptions {
  updateTarget?: MaybeRefOrGetter<StatementUpdateTarget | undefined>
  rawText: MaybeRefOrGetter<string>
  parsed: MaybeRefOrGetter<ISentence | undefined>
  emitUpdate: (payload: StatementUpdatePayload) => void
}

export function applyEffectEditorResultToSentence(sentence: ISentence, result: EffectEditorResult): ISentence {
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

const EFFECT_TARGET_BG_MAIN = 'bg-main'
const EFFECT_TARGET_FIG_LEFT = 'fig-left'
const EFFECT_TARGET_FIG_CENTER = 'fig-center'
const EFFECT_TARGET_FIG_RIGHT = 'fig-right'

function resolveEffectPreviewTarget(sentence: ISentence): string {
  switch (sentence.command) {
    case commandType.changeBg: {
      return EFFECT_TARGET_BG_MAIN
    }
    case commandType.changeFigure: {
      const figureId = readSentenceArgString(sentence, 'id').trim()
      if (figureId) {
        return figureId
      }

      if (hasSentenceTruthyFlag(sentence, 'left')) {
        return EFFECT_TARGET_FIG_LEFT
      }
      if (hasSentenceTruthyFlag(sentence, 'right')) {
        return EFFECT_TARGET_FIG_RIGHT
      }
      return EFFECT_TARGET_FIG_CENTER
    }
    default: {
      return readSentenceArgString(sentence, 'target').trim()
    }
  }
}

/**
 * 将更新目标转换为文件中的起始行号（1-based）。
 */
function resolveBaseLineNumber(
  state: TextProjectionState | SceneVisualProjectionState,
  target: StatementUpdateTarget | undefined,
): number {
  if (!target) {
    return 1
  }

  if (target.kind === 'line') {
    return target.lineNumber
  }

  if (state.projection === 'visual') {
    return computeLineNumberFromStatementId(state.statements, target.statementId) ?? 1
  }

  return 1
}

/**
 * 效果编辑器打开方式的 override 函数类型。
 * 模态框通过 provide 此函数，让 bridge 在模态框上下文中
 * 使用二级 Dialog 而非 Sheet 打开效果编辑器。
 */
export type EffectEditorOpenOverride = (
  parsed: ISentence,
  applyResult: (result: EffectEditorResult) => void,
) => void

export const EFFECT_EDITOR_OPEN_OVERRIDE_KEY: InjectionKey<EffectEditorOpenOverride> =
  Symbol('effectEditorOpenOverride')

export function useStatementEffectEditorBridge(options: UseStatementEffectEditorBridgeOptions) {
  const updateTarget = computed(() => toValue(options.updateTarget))
  const rawText = computed(() => toValue(options.rawText))
  const parsed = computed(() => toValue(options.parsed))
  const effectEditorProvider = useInjectedEffectEditorProvider()
  const overriddenOpen = inject(EFFECT_EDITOR_OPEN_OVERRIDE_KEY, undefined)

  function applyEffectEditorResult(result: EffectEditorResult) {
    if (!parsed.value) {
      return
    }

    const newSentence = applyEffectEditorResultToSentence(parsed.value, result)
    const newRawText = serializeSentence(newSentence)
    const target = updateTarget.value ?? createStatementIdTarget(0)

    options.emitUpdate({
      target,
      rawText: newRawText,
      parsed: newSentence,
      source: 'effect-editor',
    })
  }

  function openEffectEditor() {
    if (!parsed.value) {
      return
    }

    // 模态框上下文：委托给 override 函数，使用二级 Dialog
    if (overriddenOpen) {
      overriddenOpen(parsed.value, applyEffectEditorResult)
      return
    }

    if (!effectEditorProvider) {
      logger.warn('未注入效果编辑器 provider，无法打开效果编辑器')
      return
    }

    const editorStore = useEditorStore()
    const state = editorStore.currentState
    if (!state || !isEditableEditor(state) || state.kind !== 'scene') {
      logger.warn('当前编辑器状态不支持效果编辑器')
      return
    }

    const baseLineNumber = resolveBaseLineNumber(state, updateTarget.value)
    const entryId = resolveEffectEditorEntryId(updateTarget.value)

    void effectEditorProvider.open({
      entryId,
      scenePath: state.path,
      baseSentence: parsed.value,
      baseLineNumber,
      baseLineText: rawText.value,
      effectTarget: resolveEffectPreviewTarget(parsed.value),
      onApply: applyEffectEditorResult,
    })
  }

  return {
    openEffectEditor,
    applyEffectEditorResult,
  }
}

function resolveEffectEditorEntryId(target: StatementUpdateTarget | undefined): number {
  if (!target) {
    return 0
  }

  if (target.kind === 'line') {
    return target.lineNumber
  }

  return target.statementId
}
