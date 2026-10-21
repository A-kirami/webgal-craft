import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseAnimationDocument } from '~/domain/document/animation-document-codec'
import { computeLineNumberFromStatementId } from '~/domain/document/scene-selection'
import { LATEST_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { resolveTransformWriteMode } from '~/domain/engine/transform-args'
import { readSentenceArgString } from '~/domain/script/sentence'
import { serializeSentence } from '~/domain/script/serialize'
import { REFERENCED_ANIMATION_EDITOR_OPEN_KEY } from '~/features/editor/animation/referenced-animation-editor-context'
import { createStatementIdTarget, StatementUpdatePayload, StatementUpdateTarget } from '~/features/editor/statement-editor/useStatementEditor'
import { isEditableEditor, useEditorStore } from '~/stores/editor'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { AnimationFrame } from '~/domain/stage/types'
import type { AnimationFramePreviewContext } from '~/features/editor/animation/useAnimationFramePreview'

interface UseStatementAnimationEditorBridgeOptions {
  updateTarget?: MaybeRefOrGetter<StatementUpdateTarget | undefined>
  parsed: MaybeRefOrGetter<ISentence | undefined>
  emitUpdate: (payload: StatementUpdatePayload) => void
  /** 语句在场景中的稳定身份，引用动画抽屉据此判断选中语句是否仍然有效 */
  entryId?: MaybeRefOrGetter<number | undefined>
}

export type StatementAnimationEditorOpenOverride = (
  parsed: ISentence,
  onApply: (sentence: ISentence) => void,
  framePreviewContext?: AnimationFramePreviewContext,
) => void

export const STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY: InjectionKey<StatementAnimationEditorOpenOverride> =
  Symbol('statementAnimationEditorOpenOverride')

interface SceneStatementLineLookupEntry {
  id: number
  rawText: string
}

function resolveVisualStatementLineNumber(
  statements: readonly SceneStatementLineLookupEntry[],
  selection: { selectedStatementId?: number, lastLineNumber?: number } | undefined,
  statementId: number,
): number | undefined {
  if (selection?.selectedStatementId === statementId && selection.lastLineNumber !== undefined) {
    return selection.lastLineNumber
  }

  return computeLineNumberFromStatementId(statements, statementId)
}

function hasAnimationOverrides(sentence: ISentence): boolean {
  return sentence.args.some(arg => arg.key === 'relative' || arg.key === 'inherit')
}

function createFramePreviewContext(parsed: ISentence, updateTarget?: StatementUpdateTarget): AnimationFramePreviewContext | undefined {
  const editorStore = useEditorStore()
  const state = editorStore.currentState
  if (!state || !isEditableEditor(state) || state.kind !== 'scene') {
    return
  }

  const selection = editorStore.currentSceneSelection
  const statementId = updateTarget?.kind === 'statement'
    ? updateTarget.statementId
    : selection?.selectedStatementId
  let sentenceId: number | undefined
  if (updateTarget?.kind === 'line') {
    sentenceId = updateTarget.lineNumber
  } else if (statementId === undefined || state.projection !== 'visual') {
    sentenceId = selection?.lastLineNumber
  } else {
    sentenceId = resolveVisualStatementLineNumber(state.statements, selection, statementId)
  }

  if (sentenceId === undefined) {
    return
  }

  const runtimeCapabilities = state.runtimeCapabilities ?? LATEST_ENGINE_RUNTIME_CAPABILITIES
  return {
    command: parsed.command,
    hasAnimationOverrides: hasAnimationOverrides(parsed),
    lineCommandString: serializeSentence(parsed),
    runtimeCapabilities,
    scenePath: state.path,
    sentenceId,
    target: readSentenceArgString(parsed, 'target').trim(),
    writeMode: resolveTransformWriteMode(parsed, runtimeCapabilities),
  }
}

export function applyAnimationEditorResultToSentence(sentence: ISentence, frames: readonly AnimationFrame[]): ISentence {
  return {
    ...sentence,
    content: JSON.stringify(frames),
  }
}

export function applyAnimationFileReferenceToSentence(sentence: ISentence, animationName: string): ISentence {
  return {
    ...sentence,
    command: commandType.setAnimation,
    commandRaw: 'setAnimation',
    content: animationName,
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
  const overriddenFileOpen = inject(REFERENCED_ANIMATION_EDITOR_OPEN_KEY, undefined)

  function emitAnimationEditorResult(
    target: StatementUpdateTarget,
    nextSentence: ISentence,
  ) {
    options.emitUpdate({
      target,
      rawText: serializeSentence(nextSentence),
      parsed: nextSentence,
      source: 'visual',
    })
  }

  function openAnimationEditor() {
    const currentParsed = parsed.value
    if (!currentParsed) {
      return
    }

    if (overriddenOpen) {
      const currentTarget = updateTarget.value ?? createStatementIdTarget(0)
      overriddenOpen(
        currentParsed,
        sentence => emitAnimationEditorResult(currentTarget, sentence),
        createFramePreviewContext(currentParsed, updateTarget.value),
      )
      return
    }

    logger.warn('未注入高级动画编辑器 provider，无法打开高级动画编辑器')
  }

  function openAnimationFileEditor() {
    const currentParsed = parsed.value
    if (!currentParsed || currentParsed.command !== commandType.setAnimation) {
      return
    }

    const state = useEditorStore().currentState
    if (!state || !isEditableEditor(state) || state.kind !== 'scene') {
      return
    }

    const statementId = toValue(options.entryId)
    if (statementId === undefined) {
      logger.warn('缺少语句身份，无法打开引用动画文件')
      return
    }

    if (overriddenFileOpen) {
      overriddenFileOpen(currentParsed, {
        framePreview: createFramePreviewContext(currentParsed, updateTarget.value),
        scenePath: state.path,
        statementId,
      })
      return
    }

    logger.warn('未注入引用动画文件编辑器 provider，无法打开动画文件')
  }

  return {
    // 模态宿主（命令默认值、语句组）没有引用动画抽屉，用来隐藏无处可去的入口
    canOpenAnimationFileEditor: overriddenFileOpen !== undefined,
    openAnimationEditor,
    openAnimationFileEditor,
  }
}
