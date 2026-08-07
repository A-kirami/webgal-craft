import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { LATEST_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { parseCommandNode, serializeCommandNode } from '~/domain/script/codec'
import { createEmptySentence, ensureParsed, StatementEntry } from '~/domain/script/sentence'
import { serializeSentence } from '~/domain/script/serialize'
import { readCallSceneCustomArgs, updateCallSceneCustomArgs, updateCommandNodeInlineComment } from '~/domain/script/update'
import { resolveStatementSpecialContentMode } from '~/features/editor/command-registry/schema'
import { EMPTY_SCENE_AUTOCOMPLETE_OPTIONS } from '~/features/editor/statement-editor/scene-autocomplete'
import { sceneAutocompleteOptionsKey } from '~/features/editor/statement-editor/scene-autocomplete-context'
import { StatementEditorSurface } from '~/features/editor/statement-editor/surface-context'
import { useEditorDynamicOptionsBootstrap } from '~/features/editor/statement-editor/useEditorDynamicOptionsBootstrap'
import { useStatementEditorContent } from '~/features/editor/statement-editor/useStatementEditorContent'
import { useStatementEditorFieldBindings } from '~/features/editor/statement-editor/useStatementEditorFieldBindings'
import { useStatementEditorParams } from '~/features/editor/statement-editor/useStatementEditorParams'
import { useStatementEditorSay } from '~/features/editor/statement-editor/useStatementEditorSay'
import { useStatementEditorScrub } from '~/features/editor/statement-editor/useStatementEditorScrub'
import { useStatementFieldDiagnostics } from '~/features/editor/statement-editor/useStatementFieldDiagnostics'
import { useStatementFileRoots } from '~/features/editor/statement-editor/useStatementFileRoots'
import { statementMetaKey, useStatementMeta } from '~/features/editor/statement-editor/useStatementMeta'

import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { TransactionSource } from '~/domain/document/transaction'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'
import type { SceneEditorDiagnostic } from '~/features/editor/diagnostics/types'

export interface StatementIdTarget {
  kind: 'statement'
  statementId: number
}

export interface TextLineTarget {
  endLineNumber: number
  kind: 'line'
  lineNumber: number
}

export type StatementUpdateTarget = StatementIdTarget | TextLineTarget

export interface StatementUpdatePayload {
  target: StatementUpdateTarget
  rawText: string
  parsed: ISentence
  /** 仅供其他编辑器视图显示的临时解析结果，不参与脚本持久化。 */
  draftParsed?: ISentence
  source?: Extract<TransactionSource, 'visual' | 'effect-editor'>
}

interface UseStatementEditorOptions {
  diagnostics?: MaybeRefOrGetter<readonly SceneEditorDiagnostic[] | undefined>
  entry: MaybeRefOrGetter<StatementEntry>
  updateTarget?: MaybeRefOrGetter<StatementUpdateTarget | undefined>
  previousSpeaker?: MaybeRefOrGetter<string | undefined>
  emitUpdate: (payload: StatementUpdatePayload) => void
  surface?: StatementEditorSurface
  runtimeCapabilities?: MaybeRefOrGetter<EngineRuntimeCapabilities | undefined>
}

export function createStatementIdTarget(statementId: number): StatementIdTarget {
  return {
    kind: 'statement',
    statementId,
  }
}

export function createTextLineTarget(
  lineNumber: number,
  endLineNumber: number = lineNumber,
): TextLineTarget {
  return {
    endLineNumber,
    kind: 'line',
    lineNumber,
  }
}

export function isStatementInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return !!target.closest('label, input, textarea, button, select, [role="combobox"], [role="switch"]')
}

export function useStatementEditor(options: UseStatementEditorOptions) {
  useEditorDynamicOptionsBootstrap()

  const entry = computed(() => toValue(options.entry))
  const supportsSceneSemantics = computed(() => toValue(options.runtimeCapabilities)?.sceneSemantics ?? true)
  const updateTarget = computed(() => toValue(options.updateTarget) ?? createStatementIdTarget(entry.value.id))
  const previousSpeaker = computed(() => toValue(options.previousSpeaker) ?? '')
  const runtimeCapabilities = computed(() => toValue(options.runtimeCapabilities) ?? LATEST_ENGINE_RUNTIME_CAPABILITIES)
  const injectedAutocompleteOptions = inject(sceneAutocompleteOptionsKey, undefined)
  const autocompleteOptions = computed(() => {
    return injectedAutocompleteOptions?.value
      ?? EMPTY_SCENE_AUTOCOMPLETE_OPTIONS
  })
  const speakerAutocompleteOptions = computed(() => autocompleteOptions.value.speakers)

  // ─── 元信息（派生链） ───
  // 卡片内嵌场景：VisualEditorStatementCard 已 provide，直接复用；
  // 侧边栏 StatementEditorPanel 不在卡片组件树内，inject 返回 undefined，自动 fallback；
  const injectedMeta = inject(statementMetaKey, undefined)
  const meta = injectedMeta ?? useStatementMeta(entry, options.runtimeCapabilities)
  const { parsed: sourceParsed, config, editorFields, argFields, contentField, theme, statementType, commandLabel } = meta

  const localDraft = ref<{ rawText: string, parsed: ISentence }>()
  // callScene 新增参数需要先显示空白编辑行，但空键参数不能写入脚本。
  // 将这类临时行保存在编辑器草稿中，领域更新仍只保留可序列化参数。
  const callSceneParameterDrafts = ref<arg[]>()
  const parsed = computed(() => localDraft.value?.parsed ?? sourceParsed.value)
  const commandNode = computed(() => parsed.value ? parseCommandNode(parsed.value) : undefined)

  // ─── 资源路径解析 ───
  const { getFieldDiagnostics } = useStatementFieldDiagnostics({
    diagnostics: options.diagnostics,
    parsed,
    runtimeCapabilities,
  })

  const { fileRootPaths } = useStatementFileRoots({
    editorFields,
  })

  // ─── 基础设施 ───
  watch(
    () => entry.value.rawText,
    (rawText) => {
      if (localDraft.value?.rawText !== rawText) {
        localDraft.value = undefined
        callSceneParameterDrafts.value = undefined
      }
    },
  )

  watch(
    () => entry.value.draftParsed,
    (draftParsed) => {
      if (draftParsed?.command !== commandType.callScene) {
        callSceneParameterDrafts.value = undefined
        return
      }

      callSceneParameterDrafts.value = readCallSceneCustomArgs(parseCommandNode(draftParsed))
    },
    { immediate: true },
  )

  function cloneSentence(sentence: ISentence): ISentence {
    return structuredClone(sentence)
  }

  function cloneArgs(args: arg[]): arg[] {
    return args.map(item => ({ ...item }))
  }

  function readEditableArgs(): arg[] {
    return parsed.value ? cloneArgs(parsed.value.args) : []
  }

  function dispatchUpdate(
    rawText: string,
    nextSentence: ISentence,
    draftParsed?: ISentence,
  ) {
    localDraft.value = {
      rawText,
      parsed: cloneSentence(nextSentence),
    }

    const update: StatementUpdatePayload = {
      target: updateTarget.value,
      rawText,
      parsed: nextSentence,
      draftParsed: draftParsed ? cloneSentence(draftParsed) : undefined,
    }
    options.emitUpdate(update)
  }

  function emitSentenceUpdate(nextSentence: ISentence, draftParsed?: ISentence) {
    dispatchUpdate(
      serializeSentence(nextSentence),
      nextSentence,
      draftParsed ?? buildCallSceneDraftParsed(nextSentence),
    )
  }

  // ─── 说话人 / 旁白 ───
  const say = useStatementEditorSay({
    entry,
    parsed,
    commandNode,
    statementType,
    previousSpeaker,
    emitUpdate,
  })

  // ─── emitUpdate：StatementEditor 的统一句子更新入口 ───
  function emitUpdate(patch: Partial<ISentence>) {
    // 先从当前节点重建一份规范化句子，再叠加局部 patch，
    // 让内容编辑、参数编辑和说话人编辑共享同一套领域序列化规则。
    const base = commandNode.value
      ? serializeCommandNode(commandNode.value)
      : (parsed.value ?? createEmptySentence())
    const newSentence: ISentence = { ...base, ...patch }

    if (patch.args) {
      newSentence.args = cloneArgs(patch.args)
    }

    emitSentenceUpdate(newSentence)
  }

  // ─── 内容处理 ───
  const contentComposable = useStatementEditorContent({
    parsed,
    commandNode,
    contentField,
    emitUpdate,
  })

  // ─── 参数读写 ───
  const params = useStatementEditorParams({
    parsed,
    commandNode,
    argFields,
    readEditableArgs,
    emitUpdate,
    runtimeCapabilities,
  })

  // ─── ParamRenderer 视图适配 ───
  const {
    canScrubArgField,
    handleArgLabelPointerDown,
    handleContentLabelPointerDown,
    commitSliderInput,
  } = useStatementEditorScrub({
    surface: options.surface ?? 'panel',
    contentField,
    readArgValue: params.getArgValue,
    readContentValue: () => parsed.value?.content ?? '',
    updateArgValue: (argField, value) => params.handleArgFieldChange(argField, value),
    updateContentValue: value => contentComposable.handleContentChange(value),
  })

  const fieldBindings = useStatementEditorFieldBindings({
    parsed,
    autocompleteOptions,
    say,
    content: contentComposable,
    params,
    runtimeCapabilities,
    getFieldDiagnostics,
    scrub: {
      canScrubArgField,
      commitSliderInput,
      handleArgLabelPointerDown,
      handleContentLabelPointerDown,
    },
  })
  const specialContent = {
    ...contentComposable.specialContent,
    getChoiceDiagnostics: (index: number) => getFieldDiagnostics({ kind: 'choice', index }),
  }

  const hasVisibleAdvancedParams = computed(() => {
    return !!parsed.value
      && argFields.value.some(field => field.field.advanced && params.isArgVisible(field) && !field.field.managedByEffectEditor)
  })

  const hasEffectEditor = computed(() => {
    return !!parsed.value && !!config.value.hasEffectEditor
  })

  const hasAnimationEditor = computed(() => {
    return !!parsed.value && !!config.value.hasAnimationEditor
  })

  // ─── 视图层派生计算 ───

  const specialContentMode = computed(() => resolveStatementSpecialContentMode(parsed.value))

  const commandRenderFields = computed(() => {
    return editorFields.value.filter((field) => {
      if (specialContentMode.value && field.storage === 'content') {
        return false
      }

      if (specialContentMode.value && field.field.managedBySpecialContentEditor) {
        return false
      }

      if (hasAnimationEditor.value && field.storage === 'content') {
        return false
      }

      return true
    })
  })

  const basicRenderFields = computed(() => {
    if (statementType.value === 'say') {
      return commandRenderFields.value.filter(field => field.storage !== 'commandRaw')
    }
    if (statementType.value === 'command') {
      return commandRenderFields.value
    }
    return []
  })

  const showEffectEditorButton = computed(() => statementType.value === 'command' && hasEffectEditor.value)
  const showAnimationEditorButton = computed(() => statementType.value === 'command' && hasAnimationEditor.value)
  const effectEditorAtTop = computed(() => showEffectEditorButton.value && parsed.value?.command === commandType.setTransform)
  const paramRendererSharedProps = computed(() => ({
    ...fieldBindings.paramRenderer.sharedProps.value,
    fileRootPaths: fileRootPaths.value,
  }))

  // ─── 杂项操作 ───
  function handleCommentChange(value: string) {
    emitUpdate({ content: value })
  }

  function handleRawTextChange(value: string) {
    const newParsed = ensureParsed({ ...entry.value, rawText: value })
    if (newParsed) {
      dispatchUpdate(value, newParsed)
    }
  }

  function handleInlineCommentChange(value: string) {
    if (!commandNode.value) {
      return
    }
    const updatedNode = updateCommandNodeInlineComment(commandNode.value, value)
    emitSentenceUpdate(serializeCommandNode(updatedNode))
  }

  const callSceneParameters = computed(() => {
    if (!supportsSceneSemantics.value || commandNode.value?.type !== commandType.callScene) {
      return
    }
    if (callSceneParameterDrafts.value === undefined) {
      return readCallSceneCustomArgs(commandNode.value)
    }
    return cloneArgs(callSceneParameterDrafts.value)
  })

  function handleCallSceneParametersChange(parameters: arg[]): void {
    if (!supportsSceneSemantics.value || commandNode.value?.type !== commandType.callScene) {
      return
    }
    callSceneParameterDrafts.value = cloneArgs(parameters)
    const updatedNode = updateCallSceneCustomArgs(commandNode.value, parameters)
    if (updatedNode) {
      const nextSentence = serializeCommandNode(updatedNode)
      emitSentenceUpdate(nextSentence)
    }
  }

  function buildCallSceneDraftParsed(sentence: ISentence): ISentence | undefined {
    const parameters = callSceneParameterDrafts.value
    if (sentence.command !== commandType.callScene || !parameters?.some(parameter => parameter.key.trim() === '')) {
      return
    }

    const parameterKeys = new Set(parameters.map(parameter => parameter.key))
    return {
      ...sentence,
      args: [
        ...sentence.args.filter(parameter => !parameterKeys.has(parameter.key)),
        ...cloneArgs(parameters),
      ],
    }
  }

  return {
    parsed,
    config,
    editorFields,
    contentField,
    theme,
    statementType,
    commandLabel,
    hasVisibleAdvancedParams,
    hasEffectEditor,
    commandNode,

    say: {
      effectiveSpeaker: say.effectiveSpeaker,
      narrationMode: say.narrationMode,
      speakerAutocompleteOptions,
      speakerPlaceholder: say.speakerPlaceholder,
      isNoColonStatement: say.isNoColonStatement,
      handleSpeakerChange: say.handleSpeakerChange,
      toggleNarrationMode: say.toggleNarrationMode,
    },

    content: {
      contentSelectValue: contentComposable.contentSelectValue,
      pipeToNewline: contentComposable.pipeToNewline,
      newlineToPipe: contentComposable.newlineToPipe,
      isMultilineTextField: contentComposable.isMultilineTextField,
      handleChange: contentComposable.handleContentChange,
      getSelectOptions: contentComposable.getContentFieldSelectOptions,
      specialContent,
    },

    params: {
      argFields,
      resolveFieldArgField: params.resolveFieldArgField,
      getArgValue: params.getArgValue,
      getArgDynamicOptions: params.getArgDynamicOptions,
      getArgSelectOptions: params.getArgSelectOptions,
      getArgSelectValue: params.getArgSelectValue,
      isArgVisible: params.isArgVisible,
      handleArgFieldChange: params.handleArgFieldChange,
      getFieldValue: fieldBindings.getFieldValue,
      getFieldSelectValue: fieldBindings.getFieldSelectValue,
      getFieldSelectOptions: fieldBindings.getFieldSelectOptions,
      getFieldDynamicOptions: fieldBindings.getFieldDynamicOptions,
      isFieldVisible: fieldBindings.isFieldVisible,
      handleFieldValueChange: fieldBindings.handleFieldValueChange,
      handleFieldSelectChange: fieldBindings.handleFieldSelectChange,
      readArgRuntimeValue: params.readArgRuntimeValue,
      callSceneParameters,
      handleCallSceneParametersChange,
    },

    misc: {
      handleCommentChange,
      handleRawTextChange,
      handleInlineCommentChange,
    },

    paramRenderer: {
      sharedProps: paramRendererSharedProps,
      handleUpdateValue: fieldBindings.paramRenderer.handleUpdateValue,
      handleUpdateSelect: fieldBindings.paramRenderer.handleUpdateSelect,
      handleLabelPointerDown: fieldBindings.paramRenderer.handleLabelPointerDown,
      handleCommitSlider: fieldBindings.paramRenderer.handleCommitSlider,
    },

    resource: {
      fileRootPaths,
    },

    view: {
      specialContentMode,
      commandRenderFields,
      basicRenderFields,
      showEffectEditorButton,
      showAnimationEditorButton,
      effectEditorAtTop,
    },
  }
}
