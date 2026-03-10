import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

interface EffectEditorResult {
  transform: Transform
  duration: string
  ease: string
}

interface UseStatementEffectEditorBridgeOptions {
  entryId: MaybeRefOrGetter<number>
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
 * 将语句 entry id 转换为文件中的起始行号（1-based）。
 * - text 模式：id 即行号。
 * - visual-scene 模式：当前 splitStatements 按行拆分，id 对应 statements 数组索引 + 1。
 */
function resolveBaseLineNumber(
  state: TextModeState | VisualModeSceneState,
  targetEntryId: number,
): number {
  if (state.mode === 'text') {
    return targetEntryId
  }

  const index = state.statements.findIndex(e => e.id === targetEntryId)
  return index === -1 ? 1 : index + 1
}

export function useStatementEffectEditorBridge(options: UseStatementEffectEditorBridgeOptions) {
  const entryId = computed(() => toValue(options.entryId))
  const rawText = computed(() => toValue(options.rawText))
  const parsed = computed(() => toValue(options.parsed))
  const effectEditorProvider = useInjectedEffectEditorProvider()

  function applyEffectEditorResult(result: EffectEditorResult) {
    if (!parsed.value) {
      return
    }

    const newSentence = applyEffectEditorResultToSentence(parsed.value, result)
    const newRawText = serializeSentence(newSentence)

    options.emitUpdate({
      id: entryId.value,
      rawText: newRawText,
      parsed: newSentence,
    })
  }

  function openEffectEditor() {
    if (!parsed.value) {
      return
    }

    if (!effectEditorProvider) {
      logger.warn('未注入效果编辑器 provider，无法打开效果编辑器')
      return
    }

    const editorStore = useEditorStore()
    const { currentState } = editorStore
    const isSupported = currentState?.mode === 'text'
      || (currentState?.mode === 'visual' && currentState.visualType === 'scene')
    if (!isSupported) {
      logger.warn('当前编辑器状态不支持效果编辑器')
      return
    }

    const baseLineNumber = resolveBaseLineNumber(currentState, entryId.value)

    void effectEditorProvider.open({
      entryId: entryId.value,
      scenePath: currentState.path,
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
